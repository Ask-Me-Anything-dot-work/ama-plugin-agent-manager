import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';
import { OrchestratorFetchError } from '../clients/orchestrator.client.js';
import { AgentNotFoundError, ValidationError } from '../services/agents.service.js';
import {
  ChatService,
  JobNotFoundError,
  SessionNotFoundError,
} from '../services/chat.service.js';

// Server-authoritative: message required; session_id optional (continue a
// conversation — "New conversation" simply omits it).
export const chatTurnSchema = z.object({
  message: z.string().trim().min(1, 'message is required'),
  session_id: z.string().trim().min(1).optional(),
});

function sendError(c: Context, err: unknown): Response {
  if (err instanceof ValidationError) {
    return c.json({ error: { code: err.code, message: err.message, details: err.issues } }, 400);
  }
  if (err instanceof AgentNotFoundError) {
    return c.json({ error: { code: err.code, message: err.message } }, 404);
  }
  if (err instanceof SessionNotFoundError || err instanceof JobNotFoundError) {
    return c.json({ error: { code: err.code, message: err.message } }, 404);
  }
  if (err instanceof OrchestratorFetchError) {
    const code = err.status === 503 ? 'NO_AUTH_CONFIG' : 'ORCHESTRATOR_UNREACHABLE';
    return c.json({ error: { code, message: err.message } }, err.status);
  }
  return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } }, 500);
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

function parseTurn(body: unknown) {
  const parsed = chatTurnSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'body',
        issue: issue.message,
      })),
    );
  }
  return parsed.data;
}

export function createChatRouter(service: ChatService): Hono {
  const router = new Hono();

  // One POST does the turn (plan D1): enqueue + bounded poll + history write.
  // Timeout returns { status:'running', job_id }; client resumes via GET below.
  router.post('/agents/:id/chat', async (c) => {
    try {
      const body = await readJson(c);
      const input = parseTurn(body);
      return c.json(await service.runTurn(c.req.param('id'), input));
    } catch (err) {
      return sendError(c, err);
    }
  });

  router.get('/agents/:id/chat/sessions', async (c) => {
    try {
      return c.json(await service.listSessions(c.req.param('id')));
    } catch (err) {
      return sendError(c, err);
    }
  });

  router.get('/agents/:id/chat/sessions/:sid', async (c) => {
    try {
      return c.json(await service.getSession(c.req.param('id'), c.req.param('sid')));
    } catch (err) {
      return sendError(c, err);
    }
  });

  // Resume/refresh poll for a running turn (plan D1 safety valve).
  router.get('/agents/:id/chat/jobs/:jobId', async (c) => {
    try {
      return c.json(await service.resumeJob(c.req.param('id'), c.req.param('jobId')));
    } catch (err) {
      return sendError(c, err);
    }
  });

  return router;
}

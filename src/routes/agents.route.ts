import type { Context } from 'hono';
import { Hono } from 'hono';
import { agentsPanelHtml } from '../panels/template.js';
import { agentsMixinJs } from '../panels/mixin.js';
import {
  AgentNotFoundError,
  NameTakenError,
  ValidationError,
  type AgentsService,
} from '../services/agents.service.js';

function sendError(c: Context, err: unknown): Response {
  if (err instanceof ValidationError) {
    return c.json({ error: { code: err.code, message: err.message, details: err.issues } }, 400);
  }
  if (err instanceof NameTakenError) {
    return c.json({ error: { code: err.code, message: err.message } }, 409);
  }
  if (err instanceof AgentNotFoundError) {
    return c.json({ error: { code: err.code, message: err.message } }, 404);
  }
  return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } }, 500);
}

// Malformed/missing JSON body → null → zod → 400 instead of a 500.
async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

export function createAgentsRouter(service: AgentsService): Hono {
  const router = new Hono();

  router.get('/health', (c) => c.json({ status: 'ok' }));

  router.get('/agents', async (c) => c.json(await service.list()));

  router.post('/agents', async (c) => {
    try {
      return c.json(await service.create(await readJson(c)), 201);
    } catch (err) {
      return sendError(c, err);
    }
  });

  router.get('/agents/:id', async (c) => {
    try {
      return c.json(await service.get(c.req.param('id')));
    } catch (err) {
      return sendError(c, err);
    }
  });

  router.put('/agents/:id', async (c) => {
    try {
      return c.json(await service.update(c.req.param('id'), await readJson(c)));
    } catch (err) {
      return sendError(c, err);
    }
  });

  router.patch('/agents/:id', async (c) => {
    try {
      return c.json(await service.setEnabled(c.req.param('id'), await readJson(c)));
    } catch (err) {
      return sendError(c, err);
    }
  });

  router.delete('/agents/:id', async (c) => {
    try {
      await service.remove(c.req.param('id'));
      return c.body(null, 204);
    } catch (err) {
      return sendError(c, err);
    }
  });

  router.get('/console/agents-panel.html', (c) => c.html(agentsPanelHtml));

  // Browser import() requires a JavaScript MIME type.
  router.get('/console/agents-mixin.js', (c) =>
    c.text(agentsMixinJs, 200, { 'Content-Type': 'text/javascript' }),
  );

  return router;
}

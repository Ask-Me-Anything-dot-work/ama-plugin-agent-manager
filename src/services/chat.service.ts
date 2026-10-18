import { randomUUID } from 'node:crypto';
import type { OrchestratorChatClient } from '../clients/orchestrator.client.js';
import type { AgentsRepository, ManagedAgent } from '../repositories/agents.repository.js';
import type { ChatRepository } from '../repositories/chat.repository.js';
import type { AgentSession, ChatJobView, ChatTurnResult } from '../types/chat.js';
import { AgentNotFoundError } from './agents.service.js';

export class SessionNotFoundError extends Error {
  readonly code = 'SESSION_NOT_FOUND' as const;
  constructor(id: string) {
    super(`No chat session found with id: ${id}`);
    this.name = 'SessionNotFoundError';
  }
}

export class JobNotFoundError extends Error {
  readonly code = 'JOB_NOT_FOUND' as const;
  constructor(id: string) {
    super(`No chat job found with id: ${id}`);
    this.name = 'JobNotFoundError';
  }
}

export interface ChatTurnInput {
  message: string;
  session_id?: string | undefined;
}

export interface ChatServiceOptions {
  agents: AgentsRepository;
  chat: ChatRepository;
  client: OrchestratorChatClient;
  pollTimeoutMs?: number;
  pollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const ERROR_EXCERPT_LIMIT = 500;

function excerpt(text: string | null): string {
  if (!text) return 'Job failed without an error message';
  return text.length > ERROR_EXCERPT_LIMIT ? `${text.slice(0, ERROR_EXCERPT_LIMIT)}…` : text;
}

function toEnqueuePayload(agent: ManagedAgent, message: string) {
  return {
    agent_name: agent.name,
    instructions: agent.instructions,
    model: agent.model,
    ...(agent.mcp_profile_id ? { mcp_profile_id: agent.mcp_profile_id } : {}),
    message,
  };
}

type Settled = { status: 'done' | 'failed'; output: string | null; error: string | null };

// Turn orchestration only; SQL in the repository, HTTP in the client
// (agent-contract SRP). One POST does the full turn with a bounded server-side
// poll (plan D1); the client resumes via GET …/chat/jobs/:jobId on timeout.
export class ChatService {
  private readonly agents: AgentsRepository;
  private readonly chat: ChatRepository;
  private readonly client: OrchestratorChatClient;
  private readonly pollTimeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: ChatServiceOptions) {
    this.agents = opts.agents;
    this.chat = opts.chat;
    this.client = opts.client;
    this.pollTimeoutMs = opts.pollTimeoutMs ?? 120_000;
    this.pollIntervalMs = opts.pollIntervalMs ?? 2_000;
    this.sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  }

  async runTurn(agentId: string, input: ChatTurnInput): Promise<ChatTurnResult> {
    const agent = await this.agents.get(agentId);
    if (!agent) throw new AgentNotFoundError(agentId);
    const session = await this.resolveSession(agentId, input.session_id);
    await this.chat.addMessage({
      id: randomUUID(),
      session_id: session.id,
      role: 'user',
      content: input.message,
      job_id: null,
      created_at: new Date(),
    });
    // D7 single-turn fallback: session_id omitted from enqueue payload until
    // #687 ships multi-turn. Each message is an independent orchestrator job.
    const { job_id } = await this.client.enqueueChat(toEnqueuePayload(agent, input.message));
    await this.chat.updateSessionJob(session.id, job_id);
    const settled = await this.pollUntilSettled(job_id);
    if (!settled) return { session_id: session.id, job_id, status: 'running' };
    return this.finishTurn(session.id, job_id, settled);
  }

  async resumeJob(agentId: string, jobId: string): Promise<ChatJobView> {
    const agent = await this.agents.get(agentId);
    if (!agent) throw new AgentNotFoundError(agentId);
    const session = await this.chat.getSessionByJob(jobId);
    if (!session) throw new JobNotFoundError(jobId);
    const settled = await this.pollUntilSettled(jobId);
    if (!settled) return { job_id: jobId, status: 'running' };
    const finished = await this.finishTurn(session.id, jobId, settled);
    return {
      job_id: finished.job_id,
      status: finished.status,
      ...(finished.reply !== undefined ? { reply: finished.reply } : {}),
      ...(finished.error !== undefined ? { error: finished.error } : {}),
    };
  }

  async listSessions(agentId: string) {
    const agent = await this.agents.get(agentId);
    if (!agent) throw new AgentNotFoundError(agentId);
    return this.chat.listSessionsByAgent(agentId);
  }

  async getSession(agentId: string, sessionId: string) {
    const agent = await this.agents.get(agentId);
    if (!agent) throw new AgentNotFoundError(agentId);
    const found = await this.chat.getSessionWithMessages(sessionId);
    if (!found || found.session.agent_id !== agentId) throw new SessionNotFoundError(sessionId);
    return found;
  }

  private async resolveSession(agentId: string, sessionId?: string): Promise<AgentSession> {
    if (!sessionId) {
      return this.chat.createSession({
        id: randomUUID(),
        agent_id: agentId,
        parent_session_id: null,
        job_id: null,
        created_at: new Date(),
      });
    }
    const found = await this.chat.getSessionWithMessages(sessionId);
    if (!found || found.session.agent_id !== agentId) throw new SessionNotFoundError(sessionId);
    return found.session;
  }

  // Bounded poll (plan D1). Returns the terminal snapshot, or null on timeout.
  private async pollUntilSettled(jobId: string): Promise<Settled | null> {
    const deadline = Date.now() + this.pollTimeoutMs;
    for (;;) {
      const job = await this.client.getJob(jobId);
      if (job.status === 'done' || job.status === 'failed') {
        return { status: job.status, output: job.output, error: job.error };
      }
      if (Date.now() >= deadline) return null;
      await this.sleep(this.pollIntervalMs);
    }
  }

  // D5: assistant message written only on success; write-once guard keyed by
  // job_id so POST-poll and resume-poll races cannot duplicate it (plan T3).
  private async finishTurn(sessionId: string, jobId: string, settled: Settled): Promise<ChatTurnResult> {
    if (settled.status === 'failed') {
      return { session_id: sessionId, job_id: jobId, status: 'failed', error: excerpt(settled.error) };
    }
    if (!(await this.chat.hasAssistantMessageForJob(jobId))) {
      await this.chat.addMessage({
        id: randomUUID(),
        session_id: sessionId,
        role: 'assistant',
        content: settled.output ?? '',
        job_id: jobId,
        created_at: new Date(),
      });
    }
    return { session_id: sessionId, job_id: jobId, status: 'done', reply: settled.output ?? '' };
  }
}

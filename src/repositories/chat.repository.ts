import type { Queryable } from '../db/pool.js';
import type {
  AgentMessage,
  AgentSession,
  ChatSessionSummary,
  ChatTranscript,
} from '../types/chat.js';

export interface ChatRepository {
  createSession(session: AgentSession): Promise<AgentSession>;
  updateSessionJob(id: string, jobId: string): Promise<void>;
  addMessage(message: AgentMessage): Promise<AgentMessage>;
  listSessionsByAgent(agentId: string): Promise<ChatSessionSummary[]>;
  getSessionWithMessages(sessionId: string): Promise<ChatTranscript | null>;
  // Resume path (D1): locate the conversation that owns a job, and check
  // whether the assistant message was already written (write-once guard).
  getSessionByJob(jobId: string): Promise<AgentSession | null>;
  hasAssistantMessageForJob(jobId: string): Promise<boolean>;
}

const SESSION_COLUMNS = 'id, agent_id, parent_session_id, job_id, created_at';
const MESSAGE_COLUMNS = 'id, session_id, role, content, job_id, created_at';

// SQL only — no validation, no business rules (agent-contract SRP).
export class PgChatRepository implements ChatRepository {
  private db: Queryable | null = null;

  constructor(private readonly acquire: () => Queryable) {}

  private query(text: string, params?: unknown[]) {
    if (!this.db) this.db = this.acquire();
    return this.db.query(text, params);
  }

  async createSession(session: AgentSession): Promise<AgentSession> {
    const res = await this.query(
      `INSERT INTO agent_sessions (id, agent_id, parent_session_id, job_id)
       VALUES ($1, $2, $3, $4)
       RETURNING ${SESSION_COLUMNS}`,
      [session.id, session.agent_id, session.parent_session_id, session.job_id],
    );
    return res.rows[0] as AgentSession;
  }

  async updateSessionJob(id: string, jobId: string): Promise<void> {
    await this.query('UPDATE agent_sessions SET job_id = $2 WHERE id = $1', [id, jobId]);
  }

  async addMessage(message: AgentMessage): Promise<AgentMessage> {
    const res = await this.query(
      `INSERT INTO agent_messages (id, session_id, role, content, job_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${MESSAGE_COLUMNS}`,
      [message.id, message.session_id, message.role, message.content, message.job_id],
    );
    return res.rows[0] as AgentMessage;
  }

  async listSessionsByAgent(agentId: string): Promise<ChatSessionSummary[]> {
    const res = await this.query(
      `SELECT s.id, s.created_at, s.job_id,
              (SELECT m.content FROM agent_messages m
                WHERE m.session_id = s.id
                ORDER BY m.created_at DESC LIMIT 1) AS preview
         FROM agent_sessions s
        WHERE s.agent_id = $1
        ORDER BY COALESCE(
          (SELECT MAX(m.created_at) FROM agent_messages m WHERE m.session_id = s.id),
          s.created_at
        ) DESC`,
      [agentId],
    );
    return res.rows as ChatSessionSummary[];
  }

  async getSessionWithMessages(sessionId: string): Promise<ChatTranscript | null> {
    const sessionRes = await this.query(
      `SELECT ${SESSION_COLUMNS} FROM agent_sessions WHERE id = $1`,
      [sessionId],
    );
    const session = sessionRes.rows[0] as AgentSession | undefined;
    if (!session) return null;
    const messagesRes = await this.query(
      `SELECT ${MESSAGE_COLUMNS} FROM agent_messages
        WHERE session_id = $1 ORDER BY created_at ASC`,
      [sessionId],
    );
    return { session, messages: messagesRes.rows as AgentMessage[] };
  }

  async getSessionByJob(jobId: string): Promise<AgentSession | null> {
    const res = await this.query(
      `SELECT ${SESSION_COLUMNS} FROM agent_sessions WHERE job_id = $1`,
      [jobId],
    );
    return (res.rows[0] as AgentSession | undefined) ?? null;
  }

  async hasAssistantMessageForJob(jobId: string): Promise<boolean> {
    const res = await this.query(
      `SELECT 1 FROM agent_messages WHERE job_id = $1 AND role = 'assistant' LIMIT 1`,
      [jobId],
    );
    return res.rows.length > 0;
  }
}

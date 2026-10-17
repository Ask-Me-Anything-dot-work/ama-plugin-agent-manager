import type {
  AgentMessage,
  AgentSession,
  ChatSessionSummary,
  ChatTranscript,
} from '../../src/types/chat.js';
import type { ChatRepository } from '../../src/repositories/chat.repository.js';

function activityTime(session: AgentSession, messages: AgentMessage[]): number {
  const last = messages
    .filter((m) => m.session_id === session.id)
    .reduce<number | null>(
      (max, m) => Math.max(max ?? 0, new Date(m.created_at).getTime()),
      null,
    );
  return last ?? new Date(session.created_at).getTime();
}

// Test fake mirroring PgChatRepository semantics (incl. write-once guard).
export class InMemoryChatRepository implements ChatRepository {
  readonly sessions = new Map<string, AgentSession>();
  readonly messages: AgentMessage[] = [];

  async createSession(session: AgentSession): Promise<AgentSession> {
    this.sessions.set(session.id, { ...session });
    return { ...session };
  }

  async updateSessionJob(id: string, jobId: string): Promise<void> {
    const row = this.sessions.get(id);
    if (row) row.job_id = jobId;
  }

  async addMessage(message: AgentMessage): Promise<AgentMessage> {
    this.messages.push({ ...message });
    return { ...message };
  }

  async listSessionsByAgent(agentId: string): Promise<ChatSessionSummary[]> {
    const order = [...this.sessions.keys()];
    return [...this.sessions.values()]
      .filter((s) => s.agent_id === agentId)
      .map((s) => {
        const msgs = this.messages
          .filter((m) => m.session_id === s.id)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        return {
          id: s.id,
          created_at: s.created_at,
          job_id: s.job_id,
          preview: msgs.at(-1)?.content ?? null,
        };
      })
      .sort((a, b) => {
        const sa = this.sessions.get(a.id)!;
        const sb = this.sessions.get(b.id)!;
        const byActivity =
          activityTime(sb, this.messages) - activityTime(sa, this.messages);
        // Insertion-order tiebreak: later-created session wins on equal activity.
        return byActivity !== 0 ? byActivity : order.indexOf(b.id) - order.indexOf(a.id);
      });
  }

  async getSessionWithMessages(sessionId: string): Promise<ChatTranscript | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const messages = this.messages
      .filter((m) => m.session_id === sessionId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return { session: { ...session }, messages: messages.map((m) => ({ ...m })) };
  }

  async getSessionByJob(jobId: string): Promise<AgentSession | null> {
    for (const s of this.sessions.values()) {
      if (s.job_id === jobId) return { ...s };
    }
    return null;
  }

  async hasAssistantMessageForJob(jobId: string): Promise<boolean> {
    return this.messages.some((m) => m.job_id === jobId && m.role === 'assistant');
  }
}

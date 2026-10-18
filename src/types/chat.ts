// Shared chat types: DB rows (session/message), API views, and the
// orchestrator enqueue/job wire shapes (ama-agent-orchestrator#687
// issue-body contract — endpoint path + auth isolated in the client).

export type ChatJobStatus = 'pending' | 'queued' | 'running' | 'blocked' | 'done' | 'failed';

export type ChatTurnStatus = 'done' | 'running' | 'failed';

export interface AgentSession {
  id: string;
  agent_id: string;
  parent_session_id: string | null;
  job_id: string | null;
  created_at: Date | string;
}

export interface AgentMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  job_id: string | null;
  created_at: Date | string;
}

export interface ChatSessionSummary {
  id: string;
  created_at: Date | string;
  job_id: string | null;
  preview: string | null;
}

export interface ChatTranscript {
  session: AgentSession;
  messages: AgentMessage[];
}

export interface ChatTurnResult {
  session_id: string;
  job_id: string;
  status: ChatTurnStatus;
  reply?: string;
  error?: string;
}

export interface ChatJobView {
  job_id: string;
  status: ChatTurnStatus;
  reply?: string;
  error?: string;
}

export interface EnqueueChatPayload {
  agent_name: string;
  instructions: string;
  model: string;
  mcp_profile_id?: string;
  message: string;
  session_id?: string;
}

export interface EnqueueChatResult {
  job_id: string;
}

export interface OrchestratorJobSnapshot {
  status: ChatJobStatus;
  output: string | null;
  error: string | null;
}

import type {
  EnqueueChatPayload,
  EnqueueChatResult,
  OrchestratorJobSnapshot,
} from '../types/chat.js';

// #687 candidate path, isolated here for one-line change when the
// endpoint contract settles (plan D3).
export const CHAT_ENQUEUE_PATH = '/api/agents/chat';

export class OrchestratorFetchError extends Error {
  constructor(
    message: string,
    readonly status: 502 | 503 = 502,
  ) {
    super(message);
    this.name = 'OrchestratorFetchError';
  }
}

export interface OrchestratorChatClient {
  enqueueChat(payload: EnqueueChatPayload): Promise<EnqueueChatResult>;
  getJob(jobId: string): Promise<OrchestratorJobSnapshot>;
}

export interface OrchestratorChatClientOptions {
  baseUrl: string;
  consoleToken?: string | undefined;
  psk?: string | undefined;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

function authHeaders(opts: OrchestratorChatClientOptions): Record<string, string> {
  if (opts.consoleToken) return { 'X-Console-Token': opts.consoleToken };
  if (opts.psk) return { Authorization: `Bearer ${opts.psk}` };
  throw new OrchestratorFetchError(
    'Neither CONSOLE_TOKEN nor ORCHESTRATOR_PSK configured — set plugin config or env',
    503,
  );
}

// External HTTP only (agent-contract SRP). Auth stays server-side: the
// browser never holds orchestrator credentials (plan D3).
async function request<T>(
  opts: OrchestratorChatClientOptions,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const doFetch = opts.fetchFn ?? fetch;
  const url = `${opts.baseUrl.replace(/\/+$/, '')}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 5000);
  try {
    const res = await doFetch(url, {
      ...init,
      headers: { Accept: 'application/json', ...authHeaders(opts), ...init?.headers },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new OrchestratorFetchError(`${init?.method ?? 'GET'} ${path} returned ${res.status}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof OrchestratorFetchError) throw err;
    throw new OrchestratorFetchError(
      err instanceof Error ? err.message : 'Orchestrator core unreachable',
      502,
    );
  } finally {
    clearTimeout(timer);
  }
}

export function createOrchestratorChatClient(
  opts: OrchestratorChatClientOptions,
): OrchestratorChatClient {
  return {
    async enqueueChat(payload: EnqueueChatPayload): Promise<EnqueueChatResult> {
      // #687 shape undecided: accept either { job_id } or { id }.
      const body = await request<{ job_id?: string; id?: string }>(opts, CHAT_ENQUEUE_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const jobId = body.job_id ?? body.id;
      if (!jobId) throw new OrchestratorFetchError('Enqueue response missing job id');
      return { job_id: jobId };
    },

    async getJob(jobId: string): Promise<OrchestratorJobSnapshot> {
      const body = await request<{
        status?: string;
        output?: string | null;
        error?: string | null;
      }>(opts, `/api/jobs/${encodeURIComponent(jobId)}`);
      return {
        status: (body.status ?? 'running') as OrchestratorJobSnapshot['status'],
        output: body.output ?? null,
        error: body.error ?? null,
      };
    },
  };
}

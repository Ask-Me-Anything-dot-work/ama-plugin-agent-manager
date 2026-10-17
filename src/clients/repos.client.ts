export interface RepositoryMetadata {
  name: string;
  owner: string;
  repo: string;
  display_name?: string | null;
  description?: string | null;
  capabilities?: string[] | null;
  default_node?: string | null;
}

export class MeshFetchError extends Error {
  constructor(
    message: string,
    readonly status: 502 | 503 = 502,
  ) {
    super(message);
    this.name = 'MeshFetchError';
  }
}

export interface ReposClient {
  fetchRepos(): Promise<RepositoryMetadata[]>;
}

export interface ReposClientOptions {
  baseUrl: string;
  token: string | undefined;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

// External HTTP only (agent-contract SRP). Auth header stays server-side (D3).
export function createReposClient(opts: ReposClientOptions): ReposClient {
  const doFetch = opts.fetchFn ?? fetch;
  return {
    async fetchRepos(): Promise<RepositoryMetadata[]> {
      if (!opts.token) {
        throw new MeshFetchError(
          'CONSOLE_TOKEN not configured — set plugin config CONSOLE_TOKEN or CONSOLE_TOKEN env',
          503,
        );
      }
      const url = `${opts.baseUrl.replace(/\/+$/, '')}/api/repos`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 5000);
      try {
        const res = await doFetch(url, {
          headers: { Accept: 'application/json', 'X-Console-Token': opts.token },
          signal: controller.signal,
        });
        if (!res.ok) throw new MeshFetchError(`GET /api/repos returned ${res.status}`, 502);
        const body: unknown = await res.json();
        if (!Array.isArray(body)) throw new MeshFetchError('GET /api/repos returned non-array body', 502);
        return body as RepositoryMetadata[];
      } catch (err) {
        if (err instanceof MeshFetchError) throw err;
        throw new MeshFetchError(
          err instanceof Error ? err.message : 'Orchestrator core unreachable',
          502,
        );
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

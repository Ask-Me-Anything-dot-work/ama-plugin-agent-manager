// External HTTP only (agent-contract SRP). Registry PSK stays server-side.
export interface RegistryProfile {
  id: string;
  label: string;
  description?: string | null;
  instances?: string[];
}

export class RegistryUnavailableError extends Error {
  readonly code = 'REGISTRY_UNAVAILABLE' as const;
  constructor(message: string) {
    super(message);
    this.name = 'RegistryUnavailableError';
  }
}

export class ProfileNotFoundError extends Error {
  readonly code = 'PROFILE_NOT_FOUND' as const;
  constructor(readonly profileId: string) {
    super('Profile not found in registry');
    this.name = 'ProfileNotFoundError';
  }
}

export interface RegistryClient {
  listProfiles(): Promise<RegistryProfile[]>;
  getProfile(id: string): Promise<RegistryProfile>;
}

export interface RegistryClientOptions {
  baseUrl: string | undefined;
  psk: string | undefined;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

function requireConfig(opts: RegistryClientOptions): string {
  if (!opts.baseUrl) {
    throw new RegistryUnavailableError(
      'REGISTRY_URL not configured — set plugin config REGISTRY_URL or REGISTRY_URL env',
    );
  }
  if (!opts.psk) {
    throw new RegistryUnavailableError(
      'REGISTRY_PSK not configured — set plugin config REGISTRY_PSK or REGISTRY_PSK env',
    );
  }
  return opts.baseUrl.replace(/\/+$/, '');
}

export function createRegistryClient(opts: RegistryClientOptions): RegistryClient {
  const doFetch = opts.fetchFn ?? fetch;

  async function request(path: string): Promise<Response> {
    const base = requireConfig(opts);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 5000);
    try {
      return await doFetch(`${base}${path}`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${opts.psk}` },
        signal: controller.signal,
      });
    } catch (err) {
      throw new RegistryUnavailableError(
        err instanceof Error ? err.message : 'ama-mcp-registry unreachable',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async function parseJson(res: Response, path: string): Promise<unknown> {
    try {
      return await res.json();
    } catch {
      throw new RegistryUnavailableError(`GET ${path} returned unparseable body`);
    }
  }

  return {
    async listProfiles(): Promise<RegistryProfile[]> {
      const res = await request('/profiles');
      if (!res.ok) {
        throw new RegistryUnavailableError(`GET /profiles returned ${res.status}`);
      }
      const body = await parseJson(res, '/profiles');
      if (!Array.isArray(body)) {
        throw new RegistryUnavailableError('GET /profiles returned non-array body');
      }
      return body as RegistryProfile[];
    },

    async getProfile(id: string): Promise<RegistryProfile> {
      const path = `/profiles/${encodeURIComponent(id)}`;
      const res = await request(path);
      if (res.status === 404) throw new ProfileNotFoundError(id);
      if (!res.ok) throw new RegistryUnavailableError(`GET ${path} returned ${res.status}`);
      return (await parseJson(res, path)) as RegistryProfile;
    },
  };
}

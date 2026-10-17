import { describe, expect, test } from 'bun:test';
import {
  createRegistryClient,
  ProfileNotFoundError,
  RegistryUnavailableError,
} from '../src/clients/registry.client.js';

const profileFixture = {
  id: 'default',
  label: 'Default',
  description: 'basic toolset',
  instances: ['memory'],
};

function stubFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const seen: { url: string; init: RequestInit }[] = [];
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, init: init ?? {} });
    return handler(url, init ?? {});
  };
  return { fetchFn: fetchFn as typeof fetch, seen };
}

function client(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const stub = stubFetch(handler);
  return {
    ...stub,
    client: createRegistryClient({
      baseUrl: 'http://localhost:3303',
      psk: 'secret-psk',
      fetchFn: stub.fetchFn,
    }),
  };
}

describe('createRegistryClient listProfiles', () => {
  test('GET {baseUrl}/profiles with Bearer PSK', async () => {
    const { client: c, seen } = client(() => Response.json([profileFixture]));

    const profiles = await c.listProfiles();

    expect(profiles).toEqual([profileFixture]);
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe('http://localhost:3303/profiles');
    const headers = seen[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer secret-psk');
    expect(headers.Accept).toBe('application/json');
  });

  test('tolerates trailing slash on baseUrl', async () => {
    const { fetchFn, seen } = stubFetch(() => Response.json([]));
    const slashClient = createRegistryClient({
      baseUrl: 'http://host:3303/',
      psk: 't',
      fetchFn,
    });

    await slashClient.listProfiles();
    expect(seen[0].url).toBe('http://host:3303/profiles');
  });
});

describe('createRegistryClient getProfile', () => {
  test('200 returns profile', async () => {
    const { client: c } = client(() => Response.json(profileFixture));
    expect(await c.getProfile('default')).toEqual(profileFixture);
  });

  test('encodes id in path', async () => {
    const { client: c, seen } = client(() => Response.json(profileFixture));
    await c.getProfile('a/b');
    expect(seen[0].url).toBe('http://localhost:3303/profiles/a%2Fb');
  });

  test('404 → ProfileNotFoundError with exact message', async () => {
    const { client: c } = client(() => Response.json({ error: 'Profile not found' }, { status: 404 }));
    try {
      await c.getProfile('stale-id');
      expect.unreachable('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ProfileNotFoundError);
      expect((err as ProfileNotFoundError).code).toBe('PROFILE_NOT_FOUND');
      expect((err as Error).message).toBe('Profile not found in registry');
      expect((err as ProfileNotFoundError).profileId).toBe('stale-id');
    }
  });
});

describe('createRegistryClient config errors', () => {
  test('missing REGISTRY_URL → RegistryUnavailableError, no network call', async () => {
    const { fetchFn, seen } = stubFetch(() => Response.json([]));
    const c = createRegistryClient({ baseUrl: undefined, psk: 't', fetchFn });
    try {
      await c.listProfiles();
      expect.unreachable('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(RegistryUnavailableError);
      expect((err as Error).message).toContain('REGISTRY_URL');
    }
    expect(seen).toHaveLength(0);
  });

  test('missing REGISTRY_PSK → RegistryUnavailableError, no network call', async () => {
    const { fetchFn, seen } = stubFetch(() => Response.json([]));
    const c = createRegistryClient({ baseUrl: 'http://localhost:3303', psk: undefined, fetchFn });
    try {
      await c.listProfiles();
      expect.unreachable('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(RegistryUnavailableError);
      expect((err as Error).message).toContain('REGISTRY_PSK');
    }
    expect(seen).toHaveLength(0);
  });
});

describe('createRegistryClient upstream errors', () => {
  test('non-2xx list → RegistryUnavailableError with status in message', async () => {
    const { client: c } = client(() => new Response('nope', { status: 500 }));
    try {
      await c.listProfiles();
      expect.unreachable('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(RegistryUnavailableError);
      expect((err as RegistryUnavailableError).code).toBe('REGISTRY_UNAVAILABLE');
      expect((err as Error).message).toContain('500');
    }
  });

  test('403 on getProfile → RegistryUnavailableError (auth fault, not bad id)', async () => {
    const { client: c } = client(() => new Response('forbidden', { status: 403 }));
    await expect(c.getProfile('default')).rejects.toBeInstanceOf(RegistryUnavailableError);
  });

  test('network failure → RegistryUnavailableError', async () => {
    const { client: c } = client(() => {
      throw new TypeError('Connection refused');
    });
    await expect(c.listProfiles()).rejects.toBeInstanceOf(RegistryUnavailableError);
  });

  test('non-array list body → RegistryUnavailableError', async () => {
    const { client: c } = client(() => Response.json({ oops: true }));
    await expect(c.listProfiles()).rejects.toBeInstanceOf(RegistryUnavailableError);
  });

  test('timeout aborts fetch → RegistryUnavailableError', async () => {
    const slowFetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted', 'AbortError'));
        });
      })) as typeof fetch;
    const c = createRegistryClient({
      baseUrl: 'http://localhost:3303',
      psk: 't',
      fetchFn: slowFetch,
      timeoutMs: 5,
    });
    await expect(c.listProfiles()).rejects.toBeInstanceOf(RegistryUnavailableError);
  });
});

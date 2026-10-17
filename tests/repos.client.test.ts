import { describe, expect, test } from 'bun:test';
import { createReposClient, MeshFetchError } from '../src/clients/repos.client.js';

const repoFixture = [
  {
    name: 'org/ama-memory-agent',
    owner: 'org',
    repo: 'ama-memory-agent',
    display_name: 'Memory Agent',
    description: 'memory',
    capabilities: ['ama-memory-agent', 'ama-shared-context'],
    default_node: 'chromebox',
  },
];

function stubFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const seen: { url: string; init: RequestInit }[] = [];
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, init: init ?? {} });
    return handler(url, init ?? {});
  };
  return { fetchFn: fetchFn as typeof fetch, seen };
}

describe('createReposClient', () => {
  test('GET {baseUrl}/api/repos with X-Console-Token header', async () => {
    const { fetchFn, seen } = stubFetch(() => Response.json(repoFixture));
    const client = createReposClient({
      baseUrl: 'http://localhost:3100',
      token: 'secret-token',
      fetchFn,
    });

    const repos = await client.fetchRepos();

    expect(repos).toEqual(repoFixture);
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe('http://localhost:3100/api/repos');
    const headers = seen[0].init.headers as Record<string, string>;
    expect(headers['X-Console-Token']).toBe('secret-token');
    expect(headers['Accept']).toBe('application/json');
  });

  test('tolerates trailing slash on baseUrl', async () => {
    const { fetchFn, seen } = stubFetch(() => Response.json([]));
    const client = createReposClient({ baseUrl: 'http://host:3100/', token: 't', fetchFn });

    await client.fetchRepos();
    expect(seen[0].url).toBe('http://host:3100/api/repos');
  });
});

describe('createReposClient error paths', () => {
  test('missing token → MeshFetchError 503 without network call', async () => {
    const { fetchFn, seen } = stubFetch(() => Response.json([]));
    const client = createReposClient({ baseUrl: 'http://localhost:3100', token: undefined, fetchFn });

    try {
      await client.fetchRepos();
      expect.unreachable('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(MeshFetchError);
      expect((err as MeshFetchError).status).toBe(503);
    }
    expect(seen).toHaveLength(0);
  });

  test('non-2xx upstream → MeshFetchError 502 with status in message', async () => {
    const { fetchFn } = stubFetch(() => new Response('nope', { status: 401 }));
    const client = createReposClient({ baseUrl: 'http://localhost:3100', token: 't', fetchFn });

    try {
      await client.fetchRepos();
      expect.unreachable('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(MeshFetchError);
      expect((err as MeshFetchError).status).toBe(502);
      expect((err as Error).message).toContain('401');
    }
  });

  test('network failure → MeshFetchError 502', async () => {
    const { fetchFn } = stubFetch(() => {
      throw new TypeError('Connection refused');
    });
    const client = createReposClient({ baseUrl: 'http://localhost:3100', token: 't', fetchFn });

    await expect(client.fetchRepos()).rejects.toBeInstanceOf(MeshFetchError);
  });

  test('non-array JSON body → MeshFetchError 502', async () => {
    const { fetchFn } = stubFetch(() => Response.json({ oops: true }));
    const client = createReposClient({ baseUrl: 'http://localhost:3100', token: 't', fetchFn });

    await expect(client.fetchRepos()).rejects.toBeInstanceOf(MeshFetchError);
  });
});

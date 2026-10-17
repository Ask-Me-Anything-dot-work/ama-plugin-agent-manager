import { describe, expect, test } from 'bun:test';
import type { ReposClient, RepositoryMetadata } from '../src/clients/repos.client.js';
import { MeshFetchError } from '../src/clients/repos.client.js';
import { createMeshAgentsRouter } from '../src/routes/mesh-agents.route.js';

function clientReturning(repos: RepositoryMetadata[]): ReposClient {
  return { fetchRepos: async () => repos };
}

function clientThrowing(err: unknown): ReposClient {
  return {
    fetchRepos: async () => {
      throw err;
    },
  };
}

const fixture: RepositoryMetadata[] = [
  {
    name: 'org/ama-demo',
    owner: 'org',
    repo: 'ama-demo',
    display_name: 'Demo Agent',
    description: 'demo',
    capabilities: ['ama-demo'],
    default_node: null,
  },
];

function routerWith(client: ReposClient) {
  return createMeshAgentsRouter({ client, orchestratorUrl: 'http://localhost:3100' });
}

describe('GET /mesh-agents', () => {
  test('returns mapped MeshAgentView list', async () => {
    const res = await routerWith(clientReturning(fixture)).request('/mesh-agents');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe('Demo Agent');
    expect(body[0].skills).toEqual([{ id: 'demo', name: 'demo', description: null }]);
    expect(body[0].url).toBe('http://localhost:3100/a2a/ama-demo/tasks/send');
  });

  test('fetch failure → 502 CORE_UNREACHABLE', async () => {
    const res = await routerWith(clientThrowing(new MeshFetchError('ECONNREFUSED', 502))).request(
      '/mesh-agents',
    );

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe('CORE_UNREACHABLE');
    expect(body.error.message).toContain('ECONNREFUSED');
  });

  test('missing CONSOLE_TOKEN → 503 CONSOLE_TOKEN_MISSING', async () => {
    const res = await routerWith(
      clientThrowing(new MeshFetchError('CONSOLE_TOKEN not configured', 503)),
    ).request('/mesh-agents');

    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('CONSOLE_TOKEN_MISSING');
  });

  test('exposes no mutation routes', async () => {
    const router = routerWith(clientReturning(fixture));

    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const res = await router.request('/mesh-agents', { method });
      expect(res.status).toBe(404);
    }
  });
});

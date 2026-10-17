import { describe, expect, test } from 'bun:test';
import {
  RegistryUnavailableError,
  type RegistryClient,
  type RegistryProfile,
} from '../src/clients/registry.client.js';
import { createMcpProfilesRouter } from '../src/routes/mcp-profiles.route.js';

const fixture: RegistryProfile[] = [
  {
    id: 'default',
    label: 'Default',
    description: 'basic toolset',
    instances: ['memory'],
  },
];

function clientReturning(profiles: RegistryProfile[]): RegistryClient {
  return { listProfiles: async () => profiles, getProfile: async () => profiles[0] };
}

function clientThrowing(err: unknown): RegistryClient {
  return {
    listProfiles: async () => {
      throw err;
    },
    getProfile: async () => {
      throw err;
    },
  };
}

describe('GET /mcp-profiles', () => {
  test('maps registry profiles to slim {id,label,description} projection', async () => {
    const router = createMcpProfilesRouter(clientReturning(fixture));
    const res = await router.request('/mcp-profiles');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profiles).toEqual([
      { id: 'default', label: 'Default', description: 'basic toolset' },
    ]);
  });

  test('normalizes missing description to null', async () => {
    const router = createMcpProfilesRouter(
      clientReturning([{ id: 'x', label: 'X', instances: [] }]),
    );
    const body = await (await router.request('/mcp-profiles')).json();
    expect(body.profiles).toEqual([{ id: 'x', label: 'X', description: null }]);
  });

  test('registry outage/unconfigured → 503 REGISTRY_UNAVAILABLE', async () => {
    const router = createMcpProfilesRouter(
      clientThrowing(new RegistryUnavailableError('REGISTRY_URL not configured')),
    );
    const res = await router.request('/mcp-profiles');

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe('REGISTRY_UNAVAILABLE');
    expect(body.error.message).toContain('REGISTRY_URL');
  });

  test('unexpected error → 500 INTERNAL_ERROR', async () => {
    const router = createMcpProfilesRouter(clientThrowing(new Error('boom')));
    const res = await router.request('/mcp-profiles');

    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('INTERNAL_ERROR');
  });

  test('response never contains the PSK or full profile fields', async () => {
    const router = createMcpProfilesRouter(clientReturning(fixture));
    const res = await router.request('/mcp-profiles');
    const text = await res.text();

    expect(text).not.toContain('secret-psk');
    expect(text).not.toContain('instances');
    expect(text).not.toContain('created_at');
  });

  test('exposes no mutation routes', async () => {
    const router = createMcpProfilesRouter(clientReturning(fixture));
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const res = await router.request('/mcp-profiles', { method });
      expect(res.status).toBe(404);
    }
  });
});

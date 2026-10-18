import { describe, expect, test } from 'bun:test';
import {
  ProfileNotFoundError,
  RegistryUnavailableError,
} from '../src/clients/registry.client.js';
import { AgentsService } from '../src/services/agents.service.js';
import { InMemoryAgentsRepository } from './helpers/agents-repo.js';

const validBody = {
  name: 'demo',
  description: 'desc',
  instructions: 'do things',
  model: 'test-model',
  mcp_profile_id: null,
};

function withValidator(behavior: (id: string) => Promise<void>) {
  const repo = new InMemoryAgentsRepository();
  const calls: string[] = [];
  const service = new AgentsService(repo, async (id) => {
    calls.push(id);
    await behavior(id);
  });
  return { repo, service, calls };
}

describe('AgentsService profile validation on create', () => {
  test('null/empty profile skips the registry probe entirely', async () => {
    const { service, calls, repo } = withValidator(async () => {
      throw new Error('should not be called');
    });

    await service.create({ ...validBody, mcp_profile_id: null });
    await service.create({ ...validBody, name: 'other', mcp_profile_id: '' });

    expect(calls).toEqual([]);
    expect(repo.rows.size).toBe(2);
  });

  test('valid profile id → validator called, row saved', async () => {
    const { service, calls, repo } = withValidator(async () => {});

    const agent = await service.create({ ...validBody, mcp_profile_id: 'default' });

    expect(calls).toEqual(['default']);
    expect(agent.mcp_profile_id).toBe('default');
    expect(repo.rows.size).toBe(1);
  });

  test('unknown profile id → ProfileNotFoundError, row NOT saved', async () => {
    const { service, repo } = withValidator(async (id) => {
      throw new ProfileNotFoundError(id);
    });

    await expect(
      service.create({ ...validBody, mcp_profile_id: 'stale-id' }),
    ).rejects.toBeInstanceOf(ProfileNotFoundError);
    expect(repo.rows.size).toBe(0);
  });

  test('registry unreachable → RegistryUnavailableError, row NOT saved', async () => {
    const { service, repo } = withValidator(async () => {
      throw new RegistryUnavailableError('REGISTRY_URL not configured');
    });

    await expect(
      service.create({ ...validBody, mcp_profile_id: 'default' }),
    ).rejects.toBeInstanceOf(RegistryUnavailableError);
    expect(repo.rows.size).toBe(0);
  });
});

describe('AgentsService profile validation on update/toggle', () => {
  test('PUT with valid profile re-validates and persists', async () => {
    const { service, calls } = withValidator(async () => {});
    const created = await service.create(validBody);

    const updated = await service.update(created.id, {
      ...validBody,
      mcp_profile_id: 'default',
    });

    expect(updated.mcp_profile_id).toBe('default');
    expect(calls).toEqual(['default']);
  });

  test('PUT clearing profile to null skips validation and persists null', async () => {
    const { service, calls } = withValidator(async () => {});
    const created = await service.create({ ...validBody, mcp_profile_id: 'default' });
    calls.length = 0;

    const updated = await service.update(created.id, { ...validBody, mcp_profile_id: null });

    expect(updated.mcp_profile_id).toBeNull();
    expect(calls).toEqual([]);
  });

  test('PUT with stale profile → error, row unchanged', async () => {
    const { service, repo } = withValidator(async (id) => {
      if (id === 'gone') throw new ProfileNotFoundError(id);
    });
    const created = await service.create({ ...validBody, mcp_profile_id: 'default' });

    await expect(
      service.update(created.id, { ...validBody, mcp_profile_id: 'gone' }),
    ).rejects.toBeInstanceOf(ProfileNotFoundError);
    expect(repo.rows.get(created.id)?.mcp_profile_id).toBe('default');
  });

  test('PATCH enabled toggle never probes the registry', async () => {
    const { service, calls } = withValidator(async () => {
      throw new Error('toggle must not validate');
    });
    const created = await service.create(validBody);
    calls.length = 0;

    const toggled = await service.setEnabled(created.id, { enabled: false });

    expect(toggled.enabled).toBe(false);
    expect(calls).toEqual([]);
  });
});

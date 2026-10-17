import { describe, expect, test } from 'bun:test';
import {
  AgentNotFoundError,
  AgentsService,
  NameTakenError,
  ValidationError,
} from '../src/services/agents.service.js';
import { InMemoryAgentsRepository } from './helpers/agents-repo.js';

function setup() {
  const repo = new InMemoryAgentsRepository();
  return { repo, service: new AgentsService(repo) };
}

const validBody = {
  name: 'demo',
  description: 'desc',
  instructions: 'do things',
  model: 'test-model',
  mcp_profile_id: null,
};

describe('AgentsService validation', () => {
  test('rejects missing name', async () => {
    const { service } = setup();
    await expect(service.create({ ...validBody, name: '  ' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  test('rejects missing instructions', async () => {
    const { service } = setup();
    await expect(service.create({ ...validBody, instructions: '' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  test('rejects missing model', async () => {
    const { service } = setup();
    await expect(service.create({ ...validBody, model: '' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  test('rejects null body as validation error', async () => {
    const { service } = setup();
    await expect(service.create(null)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('AgentsService create', () => {
  test('creates with server id, enabled default, trimmed fields', async () => {
    const { service, repo } = setup();
    const agent = await service.create({ ...validBody, name: '  demo  ' });

    expect(agent.id).toBeString();
    expect(agent.enabled).toBe(true);
    expect(agent.name).toBe('demo');
    expect(agent.description).toBe('desc');
    expect(repo.rows.size).toBe(1);
  });

  test('duplicate name maps pg 23505 to NameTakenError', async () => {
    const { service } = setup();
    await service.create(validBody);
    await expect(service.create(validBody)).rejects.toBeInstanceOf(NameTakenError);
  });

  test('normalizes empty optional strings to null', async () => {
    const { service } = setup();
    const agent = await service.create({
      ...validBody,
      description: '',
      mcp_profile_id: '',
    });
    expect(agent.description).toBeNull();
    expect(agent.mcp_profile_id).toBeNull();
  });
});

describe('AgentsService read/update/toggle/delete', () => {
  test('get returns row or AgentNotFoundError', async () => {
    const { service } = setup();
    const created = await service.create(validBody);

    expect((await service.get(created.id)).id).toBe(created.id);
    await expect(service.get('missing')).rejects.toBeInstanceOf(AgentNotFoundError);
  });

  test('update persists new instructions/model', async () => {
    const { service } = setup();
    const created = await service.create(validBody);

    const updated = await service.update(created.id, {
      ...validBody,
      instructions: 'new instructions',
      model: 'new-model',
    });

    expect(updated.instructions).toBe('new instructions');
    expect(updated.model).toBe('new-model');
    expect((await service.get(created.id)).model).toBe('new-model');
  });

  test('update to duplicate name → NameTakenError', async () => {
    const { service } = setup();
    const a = await service.create(validBody);
    await service.create({ ...validBody, name: 'other' });

    await expect(service.update(a.id, { ...validBody, name: 'other' })).rejects.toBeInstanceOf(
      NameTakenError,
    );
  });

  test('update missing id → AgentNotFoundError', async () => {
    const { service } = setup();
    await expect(service.update('missing', validBody)).rejects.toBeInstanceOf(
      AgentNotFoundError,
    );
  });
});

describe('AgentsService toggle/delete', () => {
  test('setEnabled toggles and persists; bad body → ValidationError', async () => {
    const { service } = setup();
    const created = await service.create(validBody);

    const disabled = await service.setEnabled(created.id, { enabled: false });
    expect(disabled.enabled).toBe(false);
    expect((await service.get(created.id)).enabled).toBe(false);

    await expect(service.setEnabled(created.id, { enabled: 'yes' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  test('remove deletes or throws AgentNotFoundError', async () => {
    const { service } = setup();
    const created = await service.create(validBody);

    await service.remove(created.id);
    await expect(service.get(created.id)).rejects.toBeInstanceOf(AgentNotFoundError);
    await expect(service.remove(created.id)).rejects.toBeInstanceOf(AgentNotFoundError);
  });
});

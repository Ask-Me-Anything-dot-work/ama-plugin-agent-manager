import { describe, expect, test } from 'bun:test';
import { createAgentsRouter } from '../src/routes/agents.route.js';
import { AgentsService } from '../src/services/agents.service.js';
import { InMemoryAgentsRepository } from './helpers/agents-repo.js';

function setup() {
  const repo = new InMemoryAgentsRepository();
  return { repo, router: createAgentsRouter(new AgentsService(repo)) };
}

const validBody = {
  name: 'demo',
  description: 'desc',
  instructions: 'do things',
  model: 'test-model',
};

function post(router: ReturnType<typeof createAgentsRouter>, body: unknown) {
  return router.request('/agents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function put(router: ReturnType<typeof createAgentsRouter>, id: string, body: unknown) {
  return router.request(`/agents/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Managed agent REST — create/list/get', () => {
  test('POST valid → 201 with full row; GET list shows it', async () => {
    const { router } = setup();

    const created = await post(router, validBody);
    expect(created.status).toBe(201);
    const row = await created.json();
    expect(row.id).toBeString();
    expect(row.enabled).toBe(true);

    const list = await router.request('/agents');
    expect(list.status).toBe(200);
    const rows = await list.json();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('demo');
  });

  test('GET /agents/:id round-trips created row', async () => {
    const { router } = setup();
    const created = await post(router, validBody);
    const { id } = await created.json();

    const res = await router.request(`/agents/${id}`);
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(id);
  });

  test('GET missing id → 404 AGENT_NOT_FOUND', async () => {
    const { router } = setup();
    const res = await router.request('/agents/nope');
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('AGENT_NOT_FOUND');
  });
});

describe('Managed agent REST — validation errors', () => {
  test('missing name → 400 VALIDATION_ERROR with details', async () => {
    const { router } = setup();
    const res = await post(router, { ...validBody, name: '' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.some((d: { field: string }) => d.field === 'name')).toBe(true);
  });

  test('duplicate name → 409 NAME_TAKEN', async () => {
    const { router } = setup();
    await post(router, validBody);
    const res = await post(router, validBody);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('NAME_TAKEN');
  });

  test('malformed JSON body → 400', async () => {
    const { router } = setup();
    const res = await router.request('/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{nope',
    });
    expect(res.status).toBe(400);
  });
});

describe('Managed agent REST — update/toggle/delete', () => {
  test('PUT edits values and persists for re-read', async () => {
    const { router } = setup();
    const { id } = await (await post(router, validBody)).json();

    const res = await put(router, id, {
      ...validBody,
      instructions: 'edited instructions',
      model: 'edited-model',
    });
    expect(res.status).toBe(200);

    const reread = await (await router.request(`/agents/${id}`)).json();
    expect(reread.instructions).toBe('edited instructions');
    expect(reread.model).toBe('edited-model');
  });

  test('PUT missing id → 404; PUT duplicate name → 409', async () => {
    const { router } = setup();
    await post(router, validBody);
    const { id } = await (await post(router, { ...validBody, name: 'other' })).json();

    expect((await put(router, 'missing', validBody)).status).toBe(404);
    expect((await put(router, id, validBody)).status).toBe(409);
  });
});

describe('Managed agent REST — toggle/delete', () => {
  test('PATCH {enabled} toggles and persists', async () => {
    const { router } = setup();
    const { id } = await (await post(router, validBody)).json();

    const off = await router.request(`/agents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    expect(off.status).toBe(200);
    expect((await off.json()).enabled).toBe(false);

    const reread = await (await router.request(`/agents/${id}`)).json();
    expect(reread.enabled).toBe(false);
  });

  test('PATCH invalid body → 400; PATCH missing id → 404', async () => {
    const { router } = setup();
    const { id } = await (await post(router, validBody)).json();

    const bad = await router.request(`/agents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: 'no' }),
    });
    expect(bad.status).toBe(400);

    const missing = await router.request('/agents/missing', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    expect(missing.status).toBe(404);
  });

  test('DELETE removes row → 204, then 404', async () => {
    const { router } = setup();
    const { id } = await (await post(router, validBody)).json();

    const del = await router.request(`/agents/${id}`, { method: 'DELETE' });
    expect(del.status).toBe(204);
    expect(await (await router.request('/agents')).json()).toHaveLength(0);

    const again = await router.request(`/agents/${id}`, { method: 'DELETE' });
    expect(again.status).toBe(404);
  });
});

import { describe, expect, test } from 'bun:test';
import { OrchestratorFetchError } from '../src/clients/orchestrator.client.js';
import { createChatTestBed, seedAgent } from './helpers/chat-fake.js';

type Bed = Awaited<ReturnType<typeof createChatTestBed>>;

function postChat(router: Bed['router'], id: string, body: unknown) {
  return router.request(`/agents/${id}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /agents/:id/chat — happy path round-trip', () => {
  test('done turn returns reply, persists history, reopenable transcript', async () => {
    const { agent, chat, router } = await createChatTestBed();
    const res = await postChat(router, agent.id, { message: 'hello' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: 'done', reply: 'ok' });

    const sessions = await (await router.request(`/agents/${agent.id}/chat/sessions`)).json();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe(body.session_id);
    expect(sessions[0].preview).toBe('ok');

    const transcript = await (
      await router.request(`/agents/${agent.id}/chat/sessions/${body.session_id}`)
    ).json();
    expect(transcript.messages.map((m: { role: string }) => m.role)).toEqual([
      'user',
      'assistant',
    ]);
    expect(await chat.getSessionWithMessages(body.session_id)).not.toBeNull();
  });

  test('continuing a conversation appends to the same session', async () => {
    const { agent, router } = await createChatTestBed();
    const first = await (await postChat(router, agent.id, { message: 'one' })).json();
    const second = await (
      await postChat(router, agent.id, { message: 'two', session_id: first.session_id })
    ).json();
    expect(second.session_id).toBe(first.session_id);
    const transcript = await (
      await router.request(`/agents/${agent.id}/chat/sessions/${first.session_id}`)
    ).json();
    expect(transcript.messages).toHaveLength(4);
  });
});

describe('POST /agents/:id/chat — error matrix', () => {
  test('empty message / malformed JSON → 400 VALIDATION_ERROR', async () => {
    const { agent, router } = await createChatTestBed();
    const empty = await postChat(router, agent.id, { message: '' });
    expect(empty.status).toBe(400);
    expect((await empty.json()).error.code).toBe('VALIDATION_ERROR');

    const malformed = await router.request(`/agents/${agent.id}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{nope',
    });
    expect(malformed.status).toBe(400);
  });

  test('unknown agent → 404 AGENT_NOT_FOUND', async () => {
    const { router } = await createChatTestBed();
    const res = await postChat(router, 'missing', { message: 'x' });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('AGENT_NOT_FOUND');
  });

  test('client 502 → ORCHESTRATOR_UNREACHABLE; 503 → NO_AUTH_CONFIG', async () => {
    const { agent, state, router } = await createChatTestBed();
    state.enqueueError = new OrchestratorFetchError('boom', 502);
    const res = await postChat(router, agent.id, { message: 'x' });
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe('ORCHESTRATOR_UNREACHABLE');

    const fresh = await createChatTestBed();
    fresh.state.enqueueError = new OrchestratorFetchError('no auth', 503);
    const res503 = await postChat(fresh.router, fresh.agent.id, { message: 'x' });
    expect(res503.status).toBe(503);
    expect((await res503.json()).error.code).toBe('NO_AUTH_CONFIG');
  });

  test('job failed → error excerpt, no zombie running status', async () => {
    const { agent, state, router } = await createChatTestBed();
    state.jobs.set('job-1', { status: 'failed', output: null, error: 'kaput' });
    const body = await (await postChat(router, agent.id, { message: 'x' })).json();
    expect(body.status).toBe('failed');
    expect(body.error).toContain('kaput');
    expect(body.reply).toBeUndefined();
  });

  test('poll timeout → running + job_id; resume endpoint completes it', async () => {
    const { agent, state, router } = await createChatTestBed();
    state.jobs.set('job-1', { status: 'running', output: null, error: null });
    const body = await (await postChat(router, agent.id, { message: 'x' })).json();
    expect(body).toMatchObject({ status: 'running', job_id: 'job-1' });

    state.jobs.set('job-1', { status: 'done', output: 'resumed', error: null });
    const resume = await router.request(`/agents/${agent.id}/chat/jobs/job-1`);
    expect(resume.status).toBe(200);
    expect((await resume.json()).reply).toBe('resumed');
  });
});

describe('chat history endpoints', () => {
  test('sessions scoped per agent; unknown session/job → 404', async () => {
    const { agent, agents, router } = await createChatTestBed();
    await seedAgent(agents, 'a2', 'other');
    await postChat(router, agent.id, { message: 'one' });
    const list = await (await router.request(`/agents/${agent.id}/chat/sessions`)).json();
    expect(list).toHaveLength(1);
    const otherList = await (await router.request('/agents/a2/chat/sessions')).json();
    expect(otherList).toHaveLength(0);

    const s = await router.request(`/agents/${agent.id}/chat/sessions/nope`);
    expect(s.status).toBe(404);
    expect((await s.json()).error.code).toBe('SESSION_NOT_FOUND');

    const j = await router.request(`/agents/${agent.id}/chat/jobs/nope`);
    expect(j.status).toBe(404);
    expect((await j.json()).error.code).toBe('JOB_NOT_FOUND');
  });
});

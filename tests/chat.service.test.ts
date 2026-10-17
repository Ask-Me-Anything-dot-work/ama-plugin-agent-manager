import { describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { AgentNotFoundError } from '../src/services/agents.service.js';
import {
  JobNotFoundError,
  SessionNotFoundError,
} from '../src/services/chat.service.js';
import { createChatTestBed, seedAgent } from './helpers/chat-fake.js';

describe('ChatService.runTurn — happy paths', () => {
  test('happy path: user + assistant persisted, done reply returned', async () => {
    const { agent, chat, service } = await createChatTestBed();
    const result = await service.runTurn(agent.id, { message: 'hello' });
    expect(result).toMatchObject({ status: 'done', reply: 'ok' });
    const t = await chat.getSessionWithMessages(result.session_id);
    expect(t?.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(t?.messages[1].job_id).toBe(result.job_id);
  });

  test('enqueue payload from agent row; no session_id (D7); profile omitted when null', async () => {
    const { agent, state, service } = await createChatTestBed();
    await service.runTurn(agent.id, { message: 'hello' });
    expect(state.enqueued[0]).toEqual({
      agent_name: 'demo',
      instructions: 'do things',
      model: 'test-model',
      mcp_profile_id: 'prof-1',
      message: 'hello',
    });

    const noProfile = await createChatTestBed(null);
    await noProfile.service.runTurn(noProfile.agent.id, { message: 'hi' });
    expect(noProfile.state.enqueued[0]).not.toHaveProperty('mcp_profile_id');
  });

  test('unknown agent → AgentNotFoundError', async () => {
    const { service } = await createChatTestBed();
    await expect(service.runTurn('missing', { message: 'x' })).rejects.toBeInstanceOf(
      AgentNotFoundError,
    );
  });
});

describe('ChatService.runTurn — failures', () => {
  test('job failed → error excerpt (500 cap), no assistant row (D5)', async () => {
    const { agent, chat, state, service } = await createChatTestBed();
    state.jobs.set('job-1', { status: 'failed', output: null, error: 'x'.repeat(600) });
    const result = await service.runTurn(agent.id, { message: 'hello' });
    expect(result.status).toBe('failed');
    expect(result.error!.length).toBe(501);
    const t = await chat.getSessionWithMessages(result.session_id);
    expect(t?.messages.some((m) => m.role === 'assistant')).toBe(false);
  });

  test('poll timeout → running + job_id; enqueue failure surfaces', async () => {
    const { agent, state, service } = await createChatTestBed();
    state.jobs.set('job-1', { status: 'running', output: null, error: null });
    expect(await service.runTurn(agent.id, { message: 'hello' })).toMatchObject({
      status: 'running',
      job_id: 'job-1',
    });

    const failing = await createChatTestBed();
    failing.state.enqueueError = new Error('down');
    await expect(failing.service.runTurn(failing.agent.id, { message: 'x' })).rejects.toThrow(
      'down',
    );
  });

  test('reuses session_id; rejects foreign/unknown session', async () => {
    const { agent, chat, service } = await createChatTestBed();
    const first = await service.runTurn(agent.id, { message: 'one' });
    const second = await service.runTurn(agent.id, {
      message: 'two',
      session_id: first.session_id,
    });
    expect(second.session_id).toBe(first.session_id);
    expect((await chat.getSessionWithMessages(first.session_id))?.messages).toHaveLength(4);
    await expect(
      service.runTurn(agent.id, { message: 'x', session_id: randomUUID() }),
    ).rejects.toBeInstanceOf(SessionNotFoundError);
  });
});

describe('ChatService.resumeJob', () => {
  test('running → running view; late done writes assistant exactly once', async () => {
    const { agent, chat, state, service } = await createChatTestBed();
    state.jobs.set('job-1', { status: 'running', output: null, error: null });
    const turn = await service.runTurn(agent.id, { message: 'hello' });
    expect(await service.resumeJob(agent.id, turn.job_id)).toEqual({
      job_id: turn.job_id,
      status: 'running',
    });

    state.jobs.set(turn.job_id, { status: 'done', output: 'late', error: null });
    expect((await service.resumeJob(agent.id, turn.job_id)).reply).toBe('late');
    expect((await service.resumeJob(agent.id, turn.job_id)).reply).toBe('late');
    const t = await chat.getSessionWithMessages(turn.session_id);
    expect(t?.messages.filter((m) => m.role === 'assistant')).toHaveLength(1);
  });

  test('unknown job → JobNotFoundError; unknown agent → AgentNotFoundError', async () => {
    const { agent, service } = await createChatTestBed();
    await expect(service.resumeJob(agent.id, 'nope')).rejects.toBeInstanceOf(JobNotFoundError);
    await expect(service.resumeJob('missing', 'nope')).rejects.toBeInstanceOf(
      AgentNotFoundError,
    );
  });
});

describe('ChatService history', () => {
  test('sessions scoped per agent, ordered by activity with preview', async () => {
    const { agent, agents, service } = await createChatTestBed();
    await seedAgent(agents, 'a2', 'other');
    await service.runTurn(agent.id, { message: 'first' });
    const second = await service.runTurn(agent.id, { message: 'second' });
    const mine = await service.listSessions(agent.id);
    expect(mine).toHaveLength(2);
    expect(mine[0].id).toBe(second.session_id);
    expect(mine[0].preview).toBe('ok');
    expect(await service.listSessions('a2')).toHaveLength(0);
  });

  test('getSession returns transcript; rejects cross-agent and unknown ids', async () => {
    const { agent, agents, service } = await createChatTestBed();
    await seedAgent(agents, 'a2', 'other');
    const turn = await service.runTurn(agent.id, { message: 'hello' });
    expect((await service.getSession(agent.id, turn.session_id)).messages).toHaveLength(2);
    await expect(service.getSession('a2', turn.session_id)).rejects.toBeInstanceOf(
      SessionNotFoundError,
    );
    await expect(service.getSession(agent.id, randomUUID())).rejects.toBeInstanceOf(
      SessionNotFoundError,
    );
  });
});

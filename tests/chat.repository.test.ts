import { describe, expect, test } from 'bun:test';
import type { AgentSession } from '../src/types/chat.js';
import { PgChatRepository } from '../src/repositories/chat.repository.js';

function mockPool() {
  const calls: { text: string; params?: unknown[] }[] = [];
  let rows: unknown[] = [];
  const pool = {
    async query(text: string, params?: unknown[]) {
      calls.push({ text, params });
      return { rows, rowCount: rows.length };
    },
  };
  return {
    pool,
    calls,
    setRows(next: unknown[]) {
      rows = next;
    },
  };
}

const session: AgentSession = {
  id: 's1',
  agent_id: 'a1',
  parent_session_id: null,
  job_id: null,
  created_at: new Date('2026-01-01T00:00:00Z'),
};

describe('PgChatRepository sessions', () => {
  test('createSession inserts and returns row via RETURNING', async () => {
    const mock = mockPool();
    mock.setRows([session]);
    const repo = new PgChatRepository(() => mock.pool);

    const out = await repo.createSession(session);

    expect(out).toEqual(session);
    expect(mock.calls[0].text).toContain('INSERT INTO agent_sessions');
    expect(mock.calls[0].params).toEqual(['s1', 'a1', null, null]);
  });

  test('updateSessionJob parameterizes id and jobId', async () => {
    const mock = mockPool();
    const repo = new PgChatRepository(() => mock.pool);

    await repo.updateSessionJob('s1', 'job-9');

    expect(mock.calls[0].text).toContain('UPDATE agent_sessions');
    expect(mock.calls[0].params).toEqual(['s1', 'job-9']);
  });

  test('getSessionByJob looks up by job_id', async () => {
    const mock = mockPool();
    mock.setRows([]);
    const repo = new PgChatRepository(() => mock.pool);

    expect(await repo.getSessionByJob('missing')).toBeNull();
    expect(mock.calls[0].text).toContain('WHERE job_id = $1');
    expect(mock.calls[0].params).toEqual(['missing']);
  });
});

describe('PgChatRepository messages', () => {
  test('addMessage inserts with role, content and job_id', async () => {
    const mock = mockPool();
    const msg = {
      id: 'm1',
      session_id: 's1',
      role: 'user' as const,
      content: 'hello',
      job_id: null,
      created_at: new Date(),
    };
    mock.setRows([msg]);
    const repo = new PgChatRepository(() => mock.pool);

    const out = await repo.addMessage(msg);

    expect(out).toEqual(msg);
    expect(mock.calls[0].text).toContain('INSERT INTO agent_messages');
    expect(mock.calls[0].params).toEqual(['m1', 's1', 'user', 'hello', null]);
  });

  test('listSessionsByAgent scopes by agent and previews last message', async () => {
    const mock = mockPool();
    mock.setRows([{ id: 's1', created_at: session.created_at, job_id: null, preview: 'hi' }]);
    const repo = new PgChatRepository(() => mock.pool);

    const out = await repo.listSessionsByAgent('a1');

    expect(out).toHaveLength(1);
    expect(mock.calls[0].text).toContain('WHERE s.agent_id = $1');
    expect(mock.calls[0].text).toContain('preview');
    expect(mock.calls[0].params).toEqual(['a1']);
  });

  test('getSessionWithMessages returns null on missing session', async () => {
    const mock = mockPool();
    mock.setRows([]);
    const repo = new PgChatRepository(() => mock.pool);

    expect(await repo.getSessionWithMessages('missing')).toBeNull();
  });

  test('hasAssistantMessageForJob checks message job_id + assistant role', async () => {
    const mock = mockPool();
    mock.setRows([]);
    const repo = new PgChatRepository(() => mock.pool);

    expect(await repo.hasAssistantMessageForJob('job-1')).toBe(false);
    expect(mock.calls[0].text).toContain("role = 'assistant'");
    expect(mock.calls[0].text).toContain('job_id = $1');
  });
});

import { describe, expect, test } from 'bun:test';
import type { ManagedAgent } from '../src/repositories/agents.repository.js';
import { PgAgentsRepository } from '../src/repositories/agents.repository.js';

function mockPool() {
  const calls: { text: string; params?: unknown[] }[] = [];
  let rows: unknown[] = [];
  let rowCount: number | null = 1;
  const pool = {
    async query(text: string, params?: unknown[]) {
      calls.push({ text, params });
      return { rows, rowCount };
    },
  };
  return {
    pool,
    calls,
    setRows(next: unknown[]) {
      rows = next;
    },
    setRowCount(next: number | null) {
      rowCount = next;
    },
  };
}

const sample: ManagedAgent = {
  id: 'a1',
  name: 'demo',
  description: null,
  instructions: 'do things',
  model: 'test-model',
  mcp_profile_id: null,
  enabled: true,
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
};

describe('PgAgentsRepository', () => {
  test('list selects all columns ordered by created_at', async () => {
    const mock = mockPool();
    mock.setRows([sample]);
    const repo = new PgAgentsRepository(() => mock.pool);

    const out = await repo.list();

    expect(out).toEqual([sample]);
    expect(mock.calls[0].text).toContain('SELECT');
    expect(mock.calls[0].text).toContain('FROM agents');
    expect(mock.calls[0].text).toContain('ORDER BY created_at');
    expect(mock.calls[0].params).toBeUndefined();
  });

  test('get is parameterized by id and returns null on empty result', async () => {
    const mock = mockPool();
    mock.setRows([]);
    const repo = new PgAgentsRepository(() => mock.pool);

    expect(await repo.get('missing')).toBeNull();
    expect(mock.calls[0].text).toContain('WHERE id = $1');
    expect(mock.calls[0].params).toEqual(['missing']);
  });

  test('create inserts and returns row via RETURNING', async () => {
    const mock = mockPool();
    mock.setRows([sample]);
    const repo = new PgAgentsRepository(() => mock.pool);

    const out = await repo.create(sample);

    expect(out).toEqual(sample);
    expect(mock.calls[0].text).toContain('INSERT INTO agents');
    expect(mock.calls[0].text).toContain('RETURNING');
    expect(mock.calls[0].params).toEqual([
      'a1',
      'demo',
      null,
      'do things',
      'test-model',
      null,
      true,
    ]);
  });
});

describe('PgAgentsRepository (mutations)', () => {
  test('update parameterizes fields and bumps updated_at', async () => {
    const mock = mockPool();
    mock.setRows([sample]);
    const repo = new PgAgentsRepository(() => mock.pool);

    await repo.update('a1', {
      name: 'demo',
      description: 'd',
      instructions: 'x',
      model: 'm',
      mcp_profile_id: 'p',
    });

    expect(mock.calls[0].text).toContain('UPDATE agents');
    expect(mock.calls[0].text).toContain('updated_at = NOW()');
    expect(mock.calls[0].params).toEqual(['a1', 'demo', 'd', 'x', 'm', 'p']);
  });

  test('setEnabled updates one field', async () => {
    const mock = mockPool();
    mock.setRows([{ ...sample, enabled: false }]);
    const repo = new PgAgentsRepository(() => mock.pool);

    const out = await repo.setEnabled('a1', false);

    expect(out?.enabled).toBe(false);
    expect(mock.calls[0].text).toContain('SET enabled = $2');
    expect(mock.calls[0].params).toEqual(['a1', false]);
  });

  test('delete reports whether a row was removed', async () => {
    const mock = mockPool();
    const repo = new PgAgentsRepository(() => mock.pool);

    mock.setRowCount(1);
    expect(await repo.delete('a1')).toBe(true);

    mock.setRowCount(0);
    expect(await repo.delete('gone')).toBe(false);
    expect(mock.calls[0].text).toContain('DELETE FROM agents');
    expect(mock.calls[1].params).toEqual(['gone']);
  });
});

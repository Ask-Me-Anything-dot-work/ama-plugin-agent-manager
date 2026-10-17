import { expect, test, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raw = readFileSync(
  join(import.meta.dir, '..', 'migrations', '001_create_agents.sql'),
  'utf8',
);

// Strip SQL comments so prose mentioning deferred columns can't trip the absent-check.
const sql = raw
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

describe('agents migration', () => {
  const requiredColumns = [
    'id',
    'name',
    'description',
    'instructions',
    'model',
    'mcp_profile_id',
    'enabled',
    'created_at',
    'updated_at',
  ];

  test('creates agents table with all v1 columns', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS agents');
    for (const col of requiredColumns) {
      expect(sql).toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  test('id is primary key', () => {
    expect(sql).toMatch(/id\s+TEXT PRIMARY KEY/i);
  });

  test('name is unique and not null', () => {
    expect(sql).toMatch(/name\s+TEXT NOT NULL UNIQUE/i);
  });

  test('enabled defaults to true', () => {
    expect(sql).toMatch(/enabled\s+BOOLEAN NOT NULL DEFAULT TRUE/i);
  });

  test('deferred columns are absent (fluff-risk columns)', () => {
    const deferred = ['skills', 'blocking', 'timeoutSeconds', 'timeout_seconds', 'nodeAffinity', 'node_affinity'];
    for (const col of deferred) {
      expect(sql).not.toMatch(new RegExp(`\\b${col}\\b`, 'i'));
    }
  });
});

import { expect, test, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readSql(name: string): string {
  const raw = readFileSync(join(import.meta.dir, '..', 'migrations', name), 'utf8');
  // Strip SQL comments so prose mentioning deferred columns can't trip the absent-check.
  return raw
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

const sql = readSql('001_create_agents.sql');
const chatSql = readSql('002_create_agent_chat_history.sql');

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

  test('agents v1 columns are untouched by the chat migration', () => {
    expect(chatSql).not.toContain('ALTER TABLE agents');
  });
});

describe('chat history migration', () => {
  test('creates agent_sessions with required columns', () => {
    expect(chatSql).toContain('CREATE TABLE IF NOT EXISTS agent_sessions');
    for (const col of ['id', 'agent_id', 'parent_session_id', 'job_id', 'created_at']) {
      expect(chatSql).toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  test('creates agent_messages with role CHECK, content and job_id', () => {
    expect(chatSql).toContain('CREATE TABLE IF NOT EXISTS agent_messages');
    expect(chatSql).toMatch(/role\s+TEXT NOT NULL CHECK \(role IN \('user','assistant'\)\)/);
    expect(chatSql).toMatch(/content\s+TEXT NOT NULL/);
    expect(chatSql).toMatch(/job_id\s+TEXT/);
  });

  test('write-once guard: unique index on assistant messages per job', () => {
    expect(chatSql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_messages_assistant_job\s+ON agent_messages \(job_id\) WHERE role = 'assistant'/,
    );
  });

  test('sessions cascade from agents; messages cascade from sessions', () => {
    expect(chatSql).toMatch(
      /agent_id\s+TEXT NOT NULL REFERENCES agents\(id\) ON DELETE CASCADE/,
    );
    expect(chatSql).toMatch(
      /session_id\s+TEXT NOT NULL REFERENCES agent_sessions\(id\) ON DELETE CASCADE/,
    );
    expect(chatSql).toMatch(
      /parent_session_id\s+TEXT REFERENCES agent_sessions\(id\) ON DELETE CASCADE/,
    );
  });

  test('indexes exist for agent sessions and session messages', () => {
    expect(chatSql).toContain('idx_agent_sessions_agent');
    expect(chatSql).toContain('idx_agent_messages_session');
  });
});

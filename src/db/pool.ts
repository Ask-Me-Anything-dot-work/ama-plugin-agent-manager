import { Pool } from 'pg';

// Minimal query surface so tests can substitute a mock pool.
export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
}

let current: Pool | null = null;

// DSN precedence (ADR-002): plugin config DATABASE_URL → process.env.DATABASE_URL
// → POSTGRES_* fallbacks (mirrors orchestrator DatabaseService).
export function resolveDatabaseUrl(
  configUrl: string | undefined,
  env: Record<string, string | undefined> = process.env,
): string {
  if (configUrl) return configUrl;
  if (env.DATABASE_URL) return env.DATABASE_URL;
  const user = env.POSTGRES_USER ?? env.PROJECT_NAME;
  const password = env.POSTGRES_PASSWORD;
  const database = env.PGDATABASE;
  if (user && password && database) {
    const host = env.POSTGRES_HOST ?? 'localhost';
    const port = env.POSTGRES_PORT ?? '5432';
    return `postgresql://${user}:${password}@${host}:${port}/${database}`;
  }
  throw new Error(
    'DATABASE_URL not configured: set plugin config DATABASE_URL, DATABASE_URL env, or POSTGRES_USER + POSTGRES_PASSWORD + PGDATABASE',
  );
}

// Lazy singleton — Pool connects on first query, so plugin start never
// fails on a missing DSN; the first agents request surfaces the error.
export function ensurePool(dsn: string): Pool {
  if (!current) current = new Pool({ connectionString: dsn });
  return current;
}

export async function closePool(): Promise<void> {
  if (!current) return;
  const pool = current;
  current = null;
  await pool.end();
}

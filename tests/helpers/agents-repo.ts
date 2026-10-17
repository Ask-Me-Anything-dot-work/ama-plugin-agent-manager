import type {
  AgentsRepository,
  ManagedAgent,
  ManagedAgentFields,
} from '../../src/repositories/agents.repository.js';

function uniqueViolation(): Error & { code: string } {
  const err = new Error(
    'duplicate key value violates unique constraint "agents_name_key"',
  ) as Error & { code: string };
  err.code = '23505';
  return err;
}

// Test fake mirroring PgAgentsRepository semantics (incl. pg 23505 on name clash).
export class InMemoryAgentsRepository implements AgentsRepository {
  readonly rows = new Map<string, ManagedAgent>();

  async list(): Promise<ManagedAgent[]> {
    return [...this.rows.values()].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }

  async get(id: string): Promise<ManagedAgent | null> {
    return this.rows.get(id) ?? null;
  }

  async create(agent: ManagedAgent): Promise<ManagedAgent> {
    if ([...this.rows.values()].some((r) => r.name === agent.name)) {
      throw uniqueViolation();
    }
    this.rows.set(agent.id, { ...agent });
    return { ...agent };
  }

  async update(id: string, fields: ManagedAgentFields): Promise<ManagedAgent | null> {
    const row = this.rows.get(id);
    if (!row) return null;
    if ([...this.rows.values()].some((r) => r.id !== id && r.name === fields.name)) {
      throw uniqueViolation();
    }
    const next: ManagedAgent = { ...row, ...fields, updated_at: new Date() };
    this.rows.set(id, next);
    return { ...next };
  }

  async setEnabled(id: string, enabled: boolean): Promise<ManagedAgent | null> {
    const row = this.rows.get(id);
    if (!row) return null;
    const next: ManagedAgent = { ...row, enabled, updated_at: new Date() };
    this.rows.set(id, next);
    return { ...next };
  }

  async delete(id: string): Promise<boolean> {
    return this.rows.delete(id);
  }
}

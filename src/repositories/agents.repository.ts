import type { Queryable } from '../db/pool.js';

export interface ManagedAgent {
  id: string;
  name: string;
  description: string | null;
  instructions: string;
  model: string;
  mcp_profile_id: string | null;
  enabled: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface ManagedAgentFields {
  name: string;
  description: string | null;
  instructions: string;
  model: string;
  mcp_profile_id: string | null;
}

export interface AgentsRepository {
  list(): Promise<ManagedAgent[]>;
  get(id: string): Promise<ManagedAgent | null>;
  create(agent: ManagedAgent): Promise<ManagedAgent>;
  update(id: string, fields: ManagedAgentFields): Promise<ManagedAgent | null>;
  setEnabled(id: string, enabled: boolean): Promise<ManagedAgent | null>;
  delete(id: string): Promise<boolean>;
}

const COLUMNS =
  'id, name, description, instructions, model, mcp_profile_id, enabled, created_at, updated_at';

function firstRow(res: { rows: unknown[] }): ManagedAgent | null {
  return (res.rows[0] as ManagedAgent | undefined) ?? null;
}

// SQL only — no validation, no business rules (agent-contract SRP).
export class PgAgentsRepository implements AgentsRepository {
  private db: Queryable | null = null;

  constructor(private readonly acquire: () => Queryable) {}

  private query(text: string, params?: unknown[]) {
    if (!this.db) this.db = this.acquire();
    return this.db.query(text, params);
  }

  async list(): Promise<ManagedAgent[]> {
    const res = await this.query(`SELECT ${COLUMNS} FROM agents ORDER BY created_at ASC`);
    return res.rows as ManagedAgent[];
  }

  async get(id: string): Promise<ManagedAgent | null> {
    return firstRow(await this.query(`SELECT ${COLUMNS} FROM agents WHERE id = $1`, [id]));
  }

  async create(agent: ManagedAgent): Promise<ManagedAgent> {
    const res = await this.query(
      `INSERT INTO agents (id, name, description, instructions, model, mcp_profile_id, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${COLUMNS}`,
      [
        agent.id,
        agent.name,
        agent.description,
        agent.instructions,
        agent.model,
        agent.mcp_profile_id,
        agent.enabled,
      ],
    );
    return firstRow(res) as ManagedAgent;
  }

  async update(id: string, fields: ManagedAgentFields): Promise<ManagedAgent | null> {
    const res = await this.query(
      `UPDATE agents
       SET name = $2, description = $3, instructions = $4, model = $5, mcp_profile_id = $6, updated_at = NOW()
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [id, fields.name, fields.description, fields.instructions, fields.model, fields.mcp_profile_id],
    );
    return firstRow(res);
  }

  async setEnabled(id: string, enabled: boolean): Promise<ManagedAgent | null> {
    const res = await this.query(
      `UPDATE agents SET enabled = $2, updated_at = NOW() WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, enabled],
    );
    return firstRow(res);
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.query('DELETE FROM agents WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }
}

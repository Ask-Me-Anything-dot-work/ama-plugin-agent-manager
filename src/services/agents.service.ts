import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type {
  AgentsRepository,
  ManagedAgent,
  ManagedAgentFields,
} from '../repositories/agents.repository.js';
import type { ProfileValidator } from './mcp-profile.validator.js';

// Server-authoritative validation (D6): name/instructions/model required,
// description + mcp_profile_id nullable; id + enabled set by server.
export const managedAgentFieldsSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  description: z.string().nullish(),
  instructions: z.string().trim().min(1, 'instructions is required'),
  model: z.string().trim().min(1, 'model is required'),
  mcp_profile_id: z.string().nullish(),
});

export const enabledPatchSchema = z.object({
  enabled: z.boolean(),
});

export class ValidationError extends Error {
  readonly code = 'VALIDATION_ERROR' as const;
  constructor(readonly issues: { field: string; issue: string }[]) {
    super(`Validation failed: ${issues.map((i) => `${i.field}: ${i.issue}`).join(', ')}`);
    this.name = 'ValidationError';
  }
}

export class AgentNotFoundError extends Error {
  readonly code = 'AGENT_NOT_FOUND' as const;
  constructor(id: string) {
    super(`No agent found with id: ${id}`);
    this.name = 'AgentNotFoundError';
  }
}

export class NameTakenError extends Error {
  readonly code = 'NAME_TAKEN' as const;
  constructor(name: string) {
    super(`Agent name already exists: ${name}`);
    this.name = 'NameTakenError';
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === '23505'
  );
}

function toFields(input: z.infer<typeof managedAgentFieldsSchema>): ManagedAgentFields {
  return {
    name: input.name,
    description: input.description?.trim() || null,
    instructions: input.instructions,
    model: input.model,
    mcp_profile_id: input.mcp_profile_id?.trim() || null,
  };
}

// Validation + CRUD rules only; SQL lives in the repository (agent-contract SRP).
export class AgentsService {
  constructor(
    private readonly repo: AgentsRepository,
    private readonly validateProfile?: ProfileValidator,
  ) {}

  list(): Promise<ManagedAgent[]> {
    return this.repo.list();
  }

  async get(id: string): Promise<ManagedAgent> {
    const agent = await this.repo.get(id);
    if (!agent) throw new AgentNotFoundError(id);
    return agent;
  }

  async create(body: unknown): Promise<ManagedAgent> {
    const fields = this.parse(body);
    await this.checkProfile(fields);
    const now = new Date();
    const agent: ManagedAgent = {
      id: randomUUID(),
      ...fields,
      enabled: true,
      created_at: now,
      updated_at: now,
    };
    try {
      return await this.repo.create(agent);
    } catch (err) {
      if (isUniqueViolation(err)) throw new NameTakenError(fields.name);
      throw err;
    }
  }

  async update(id: string, body: unknown): Promise<ManagedAgent> {
    const fields = this.parse(body);
    await this.checkProfile(fields);
    try {
      const updated = await this.repo.update(id, fields);
      if (!updated) throw new AgentNotFoundError(id);
      return updated;
    } catch (err) {
      if (err instanceof AgentNotFoundError || !isUniqueViolation(err)) throw err;
      throw new NameTakenError(fields.name);
    }
  }

  async setEnabled(id: string, body: unknown): Promise<ManagedAgent> {
    const parsed = enabledPatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError([{ field: 'enabled', issue: 'enabled must be a boolean' }]);
    }
    const updated = await this.repo.setEnabled(id, parsed.data.enabled);
    if (!updated) throw new AgentNotFoundError(id);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const removed = await this.repo.delete(id);
    if (!removed) throw new AgentNotFoundError(id);
  }

  private parse(body: unknown): ManagedAgentFields {
    const parsed = managedAgentFieldsSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((issue) => ({
          field: issue.path.join('.') || 'body',
          issue: issue.message,
        })),
      );
    }
    return toFields(parsed.data);
  }

  // Fail-closed save validation (D3/D4): null profile skips the registry probe.
  private async checkProfile(fields: ManagedAgentFields): Promise<void> {
    if (fields.mcp_profile_id && this.validateProfile) {
      await this.validateProfile(fields.mcp_profile_id);
    }
  }
}

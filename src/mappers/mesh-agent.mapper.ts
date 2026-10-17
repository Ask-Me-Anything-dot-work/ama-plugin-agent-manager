import type { RepositoryMetadata } from '../clients/repos.client.js';

export interface SkillView {
  id: string;
  name: string;
  description: null;
}

export interface MeshAgentView {
  repo: string;
  name: string;
  description: string | null;
  url: string;
  skills: SkillView[];
  default_node: string | null;
}

// Pure mapper. Mirrors orchestrator agent-card.service.ts semantics
// (`ama-` prefix stripped; id snake_case, name spaced, description null) —
// the boundary forbids importing it, so unit tests pin the shape (ADR-002).
export function toSkill(capability: string): SkillView {
  const stripped = capability.replace(/^ama-/, '');
  return {
    id: stripped.replace(/-/g, '_'),
    name: stripped.replace(/-/g, ' '),
    description: null,
  };
}

export function toMeshAgent(meta: RepositoryMetadata, orchestratorUrl: string): MeshAgentView {
  const capabilities = meta.capabilities ?? [];
  return {
    repo: meta.repo,
    name: meta.display_name || meta.repo,
    description: meta.description ?? null,
    url: `${orchestratorUrl.replace(/\/+$/, '')}/a2a/${meta.repo}/tasks/send`,
    skills: capabilities.map(toSkill),
    default_node: meta.default_node ?? null,
  };
}

export function mapReposToMeshAgents(
  repos: RepositoryMetadata[],
  orchestratorUrl: string,
): MeshAgentView[] {
  return repos.map((meta) => toMeshAgent(meta, orchestratorUrl));
}

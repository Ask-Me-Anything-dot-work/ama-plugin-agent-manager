import { describe, expect, test } from 'bun:test';
import type { RepositoryMetadata } from '../src/clients/repos.client.js';
import { mapReposToMeshAgents, toMeshAgent, toSkill } from '../src/mappers/mesh-agent.mapper.js';

const meta: RepositoryMetadata = {
  name: 'Ask-Me-Anything-dot-work/ama-memory-agent',
  owner: 'Ask-Me-Anything-dot-work',
  repo: 'ama-memory-agent',
  display_name: 'Memory Agent',
  description: 'Personal context engine',
  capabilities: ['ama-memory-agent', 'ama-shared-context'],
  default_node: 'chromebox',
};

describe('toSkill — mirrors orchestrator agent-card.service.ts', () => {
  test('strips ama- prefix, snake id, spaced name, null description', () => {
    expect(toSkill('ama-memory-agent')).toEqual({
      id: 'memory_agent',
      name: 'memory agent',
      description: null,
    });
  });

  test('capabilities without ama- prefix keep full word in id/name', () => {
    expect(toSkill('n8n-workflows')).toEqual({
      id: 'n8n_workflows',
      name: 'n8n workflows',
      description: null,
    });
  });

  test('single-word capability unchanged', () => {
    expect(toSkill('homelab')).toEqual({ id: 'homelab', name: 'homelab', description: null });
  });
});

describe('toMeshAgent', () => {
  test('maps repo metadata to card skills[] shape', () => {
    const view = toMeshAgent(meta, 'http://localhost:3100');

    expect(view.repo).toBe('ama-memory-agent');
    expect(view.name).toBe('Memory Agent');
    expect(view.description).toBe('Personal context engine');
    expect(view.url).toBe('http://localhost:3100/a2a/ama-memory-agent/tasks/send');
    expect(view.default_node).toBe('chromebox');
    expect(view.skills).toEqual([
      { id: 'memory_agent', name: 'memory agent', description: null },
      { id: 'shared_context', name: 'shared context', description: null },
    ]);
  });

  test('missing capabilities/display_name/description degrade gracefully', () => {
    const bare: RepositoryMetadata = {
      name: 'org/repo-x',
      owner: 'org',
      repo: 'repo-x',
    };
    const view = toMeshAgent(bare, 'http://localhost:3100/');

    expect(view.name).toBe('repo-x');
    expect(view.description).toBeNull();
    expect(view.skills).toEqual([]);
    expect(view.default_node).toBeNull();
    expect(view.url).toBe('http://localhost:3100/a2a/repo-x/tasks/send');
  });

  test('mapReposToMeshAgents maps every entry', () => {
    const views = mapReposToMeshAgents([meta, { name: 'o/r', owner: 'o', repo: 'r' }], 'http://x');
    expect(views).toHaveLength(2);
    expect(views[1].repo).toBe('r');
  });
});

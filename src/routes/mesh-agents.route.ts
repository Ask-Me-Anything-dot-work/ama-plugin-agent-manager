import { Hono } from 'hono';
import { MeshFetchError, type ReposClient } from '../clients/repos.client.js';
import { mapReposToMeshAgents } from '../mappers/mesh-agent.mapper.js';

export interface MeshAgentsDeps {
  client: ReposClient;
  orchestratorUrl: string;
}

export function createMeshAgentsRouter(deps: MeshAgentsDeps): Hono {
  const router = new Hono();

  // Read-only: no mutation endpoints exist here by design (D2/D5).
  router.get('/mesh-agents', async (c) => {
    try {
      const repos = await deps.client.fetchRepos();
      return c.json(mapReposToMeshAgents(repos, deps.orchestratorUrl));
    } catch (err) {
      if (err instanceof MeshFetchError && err.status === 503) {
        return c.json({ error: { code: 'CONSOLE_TOKEN_MISSING', message: err.message } }, 503);
      }
      const message = err instanceof Error ? err.message : 'Orchestrator core unreachable';
      return c.json({ error: { code: 'CORE_UNREACHABLE', message } }, 502);
    }
  });

  return router;
}

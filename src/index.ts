import type { OrchestratorPlugin, PluginBridge } from '@ama-work/plugin-contract';
import { Hono } from 'hono';
import { join } from 'node:path';
import { createReposClient } from './clients/repos.client.js';
import { createRegistryClient } from './clients/registry.client.js';
import { loadPluginConfig, resolveRuntimeConfig, type ResolvedRuntimeConfig } from './config/plugin-config.js';
import { closePool, ensurePool, resolveDatabaseUrl } from './db/pool.js';
import { consolePanel } from './panels/console.js';
import { PgAgentsRepository } from './repositories/agents.repository.js';
import { createAgentsRouter } from './routes/agents.route.js';
import { createMeshAgentsRouter } from './routes/mesh-agents.route.js';
import { createMcpProfilesRouter } from './routes/mcp-profiles.route.js';
import { AgentsService } from './services/agents.service.js';
import { createMcpProfileValidator } from './services/mcp-profile.validator.js';

function buildRouter(config: ResolvedRuntimeConfig): Hono {
  // Pool is lazy (ADR-002): missing DSN surfaces on first agents request, not at start.
  const repo = new PgAgentsRepository(() => ensurePool(resolveDatabaseUrl(config.databaseUrl)));
  const client = createReposClient({ baseUrl: config.orchestratorUrl, token: config.consoleToken });
  const registry = createRegistryClient({ baseUrl: config.registryUrl, psk: config.registryPsk });
  const router = new Hono();
  router.route('/', createAgentsRouter(new AgentsService(repo, createMcpProfileValidator(registry))));
  router.route('/', createMeshAgentsRouter({ client, orchestratorUrl: config.orchestratorUrl }));
  router.route('/', createMcpProfilesRouter(registry));
  return router;
}

export const plugin: OrchestratorPlugin = {
  id: 'agent-manager',
  async onStart(bridge: PluginBridge) {
    // Resolves to <pkg>/migrations from both src/ (dev) and dist/ (built).
    await bridge.runMigrations(join(import.meta.dir, '..', 'migrations'));
    const config = resolveRuntimeConfig(await loadPluginConfig(bridge));
    bridge.mountConsolePanel(consolePanel);
    bridge.mountRoutes(buildRouter(config));
    bridge.logger.info('agent-manager plugin started');
  },
  async onStop() {
    await closePool();
  },
};

export { consolePanel };
export default plugin;

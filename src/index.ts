import type { OrchestratorPlugin, PluginBridge } from '@ama-work/plugin-contract';
import { join } from 'node:path';
import { consolePanel } from './panels/console.js';
import { createAgentsRouter } from './routes/agents.route.js';

export const plugin: OrchestratorPlugin = {
  id: 'agent-manager',
  async onStart(bridge: PluginBridge) {
    // Resolves to <pkg>/migrations from both src/ (dev) and dist/ (built).
    await bridge.runMigrations(join(import.meta.dir, '..', 'migrations'));
    bridge.mountConsolePanel(consolePanel);
    bridge.mountRoutes(createAgentsRouter());
    bridge.logger.info('agent-manager plugin started');
  },
  async onStop() {
    // Registry drop unmounts routes/panels; nothing else to clean up.
  },
};

export { consolePanel };
export default plugin;

import type { ConsolePanel } from '@ama-work/plugin-contract';

const BASE = '/plugins/@ama-work/agent-manager/console';

export const consolePanel: ConsolePanel = {
  id: 'agents',
  navLabel: 'Agents',
  icon: 'users',
  mixinUrl: `${BASE}/agents-mixin.js`,
  templateUrl: `${BASE}/agents-panel.html`,
};

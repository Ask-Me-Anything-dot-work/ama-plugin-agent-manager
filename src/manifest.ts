import type { PluginManifest } from '@ama-work/plugin-contract';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// package.json is semantic-release-owned; version read at load time avoids drift.
const pkg = JSON.parse(
  readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8'),
) as { name: string; version: string };

export const manifest: PluginManifest = {
  id: 'agent-manager',
  name: 'Agent Manager',
  version: pkg.version,
  description:
    'Agent Manager plugin for the Orchestrator: Agents console panel, agents table migration, and plugin-owned routes.',
  provides: ['agents-panel', 'agents-api'],
};

export const packageName = pkg.name;

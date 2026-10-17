import { expect, test, describe, beforeEach, afterEach } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { MockBridge } from '@ama-work/plugin-contract';
import type { Hono } from 'hono';
import * as mod from '../src/index.js';

const plugin = mod.plugin;

describe('Plugin', () => {
  test('satisfies orchestrator export contract', () => {
    expect(plugin).toBeDefined();
    expect(typeof plugin.id).toBe('string');
    expect(typeof plugin.onStart).toBe('function');
    expect(typeof plugin.onStop).toBe('function');
    expect(mod.default).toBe(mod.plugin);
  });

  test('has correct id', () => {
    expect(plugin.id).toBe('agent-manager');
  });

  test('onStop completes without error', async () => {
    await expect(plugin.onStop()).resolves.toBeUndefined();
  });
});

describe('Plugin.onStart', () => {
  let bridge: MockBridge;

  beforeEach(() => {
    bridge = new MockBridge();
  });

  afterEach(() => {
    bridge.stop();
  });

  test('mounts console panel', async () => {
    bridge.mountRoutes = () => {};
    await plugin.onStart(bridge);

    expect(bridge.mountedPanels).toHaveLength(1);
    expect(bridge.mountedPanels[0]).toEqual({
      id: 'agents',
      navLabel: 'Agents',
      icon: 'users',
      mixinUrl: '/plugins/@ama-work/agent-manager/console/agents-mixin.js',
      templateUrl: '/plugins/@ama-work/agent-manager/console/agents-panel.html',
    });
  });

  test('mounts plugin routes', async () => {
    let mounted: Hono | null = null;
    bridge.mountRoutes = (router: Hono) => {
      mounted = router;
    };
    await plugin.onStart(bridge);
    expect(mounted).not.toBeNull();
  });

  test('runs migrations from package-root migrations dir', async () => {
    const calls: string[] = [];
    bridge.mountRoutes = () => {};
    bridge.runMigrations = async (dir: string) => {
      calls.push(dir);
    };

    await plugin.onStart(bridge);

    expect(calls).toHaveLength(1);
    expect(calls[0].endsWith('/migrations')).toBe(true);
    expect(existsSync(join(calls[0], '001_create_agents.sql'))).toBe(true);
  });

  test('logs startup message', async () => {
    const logs: string[] = [];
    bridge.logger.info = (msg: string) => logs.push(msg);
    bridge.mountRoutes = () => {};

    await plugin.onStart(bridge);
    expect(logs).toContain('agent-manager plugin started');
  });
});

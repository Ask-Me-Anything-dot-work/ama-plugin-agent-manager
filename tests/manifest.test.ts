import { expect, test, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { manifest, packageName } from '../src/manifest.js';
import { pluginConfigSchema } from '../src/config/plugin-config.js';

const pluginJson = JSON.parse(
  readFileSync(join(import.meta.dir, '..', 'plugin.json'), 'utf8'),
) as Record<string, unknown>;

const pkgJson = JSON.parse(
  readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8'),
) as { name: string; version: string };

describe('Manifest', () => {
  test('matches plugin.json identity fields', () => {
    expect(manifest.id).toBe('agent-manager');
    expect(manifest.name).toBe('Agent Manager');
    expect(pluginJson.id).toBe(manifest.id);
    expect(pluginJson.name).toBe(manifest.name);
    expect(pluginJson.description).toBe(manifest.description);
    expect(pluginJson.provides).toEqual(manifest.provides);
  });

  test('provides is open string array', () => {
    expect(Array.isArray(manifest.provides)).toBe(true);
    expect(manifest.provides.length).toBeGreaterThan(0);
    for (const p of manifest.provides) {
      expect(typeof p).toBe('string');
    }
  });

  test('version flows from package.json (semantic-release-owned)', () => {
    expect(manifest.version).toBe(pkgJson.version);
  });

  test('package name follows starter convention', () => {
    expect(packageName).toBe('@ama-work/agent-manager');
  });
});

describe('Reserved plugin config schema', () => {
  test('accepts empty config (all keys optional)', () => {
    expect(pluginConfigSchema.safeParse({}).success).toBe(true);
  });

  test('accepts reserved keys', () => {
    const parsed = pluginConfigSchema.safeParse({
      REGISTRY_URL: 'http://verdaccio.homelab',
      REGISTRY_PSK: 'secret',
      CONSOLE_TOKEN: 'token',
    });
    expect(parsed.success).toBe(true);
  });

  test('rejects unknown keys', () => {
    expect(pluginConfigSchema.safeParse({ UNKNOWN: 'x' }).success).toBe(false);
  });
});

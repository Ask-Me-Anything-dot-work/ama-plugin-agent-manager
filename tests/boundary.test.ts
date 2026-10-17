import { expect, test, describe } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Hard boundary: plugins must not import orchestrator internals.
// Only the contract package, HTTP/schema libs, node builtins, and relative paths.
const ALLOWED = [
  '@ama-work/plugin-contract',
  'hono',
  'zod',
];

function srcFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...srcFiles(full));
    } else if (entry.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

const importRe = /(?:^|\n)\s*import(?:\s+type)?\s+[\s\S]*?from\s+['"]([^'"]+)['"]/g;

function importsOf(file: string): string[] {
  const content = readFileSync(file, 'utf8');
  const specs: string[] = [];
  for (const match of content.matchAll(importRe)) {
    specs.push(match[1]);
  }
  return specs;
}

function isAllowed(spec: string): boolean {
  if (spec.startsWith('.') || spec.startsWith('node:')) return true;
  return ALLOWED.some((allowed) => spec === allowed || spec.startsWith(`${allowed}/`));
}

describe('Import boundary', () => {
  const files = srcFiles(join(import.meta.dir, '..', 'src'));

  test('src exists and is scanned', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  test('only contract, hono, zod, node builtins, and relative imports are used', () => {
    const violations: string[] = [];
    for (const file of files) {
      for (const spec of importsOf(file)) {
        if (!isAllowed(spec)) {
          violations.push(`${file}: ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

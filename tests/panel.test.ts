import { expect, test, describe } from 'bun:test';
import { consolePanel } from '../src/panels/console.js';
import { agentsPanelHtml } from '../src/panels/template.js';
import { agentsMixinJs } from '../src/panels/mixin.js';

describe('ConsolePanel descriptor', () => {
  test('has required shape', () => {
    expect(consolePanel.id).toBe('agents');
    expect(consolePanel.navLabel).toBe('Agents');
    expect(consolePanel.icon).toBe('users');
    expect(typeof consolePanel.mixinUrl).toBe('string');
    expect(typeof consolePanel.templateUrl).toBe('string');
  });

  test('asset URLs live under plugin route prefix', () => {
    const prefix = '/plugins/@ama-work/agent-manager/';
    expect(consolePanel.templateUrl.startsWith(prefix)).toBe(true);
    expect(consolePanel.mixinUrl.startsWith(prefix)).toBe(true);
  });
});

describe('Panel template', () => {
  const forbidden = /<!doctype|<html|<head|<body|<meta|<title|<style|<script/i;

  test('is an HTML fragment with no document-level or sanitizer-stripped tags', () => {
    expect(forbidden.test(agentsPanelHtml)).toBe(false);
  });

  test('is a single rooted fragment starting with <div', () => {
    expect(agentsPanelHtml.trimStart().startsWith('<div')).toBe(true);
  });

  test('contains no viewport-height sizing (100vh)', () => {
    expect(agentsPanelHtml).not.toContain('100vh');
  });

  test('renders empty state text', () => {
    expect(agentsPanelHtml).toContain('No agents yet');
  });
});

describe('Panel mixin', () => {
  test('is ESM with default export', () => {
    expect(agentsMixinJs).toContain('export default');
  });

  test('has no imports (browser-safe)', () => {
    expect(agentsMixinJs).not.toMatch(/\bimport\b/);
  });
});

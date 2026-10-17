import { expect, test, describe } from 'bun:test';
import { consolePanel } from '../src/panels/console.js';
import { agentsPanelHtml } from '../src/panels/template.js';
import { managedSectionHtml } from '../src/panels/template-managed.js';
import { meshSectionHtml } from '../src/panels/template-mesh.js';
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

  test('renders managed empty state text', () => {
    expect(agentsPanelHtml).toContain('No agents yet');
  });

  test('composes both sections', () => {
    expect(agentsPanelHtml).toContain('Managed agents');
    expect(agentsPanelHtml).toContain('Mesh agents');
  });
});

describe('Managed section affordances', () => {
  test('has Create button and edit form fields', () => {
    expect(managedSectionHtml).toContain('data-agents-create');
    expect(managedSectionHtml).toContain('data-agents-field-name');
    expect(managedSectionHtml).toContain('data-agents-field-instructions');
    expect(managedSectionHtml).toContain('data-agents-field-model');
    expect(managedSectionHtml).toContain('data-agents-field-mcp-profile');
    expect(managedSectionHtml).toContain('data-agents-field-enabled');
  });

  test('has table actions: toggle, edit, delete', () => {
    expect(managedSectionHtml).toContain('data-agents-enabled-toggle');
    expect(managedSectionHtml).toContain('data-agents-edit');
    expect(managedSectionHtml).toContain('data-agents-delete');
    expect(managedSectionHtml).toContain('data-agents-save');
  });

  test('labels rows as Managed agent', () => {
    expect(managedSectionHtml).toContain('data-managed-badge');
    expect(managedSectionHtml).toContain('Managed agent');
  });
});

describe('Mesh section read-only guarantees', () => {
  const forbiddenAffordances = [
    'data-agents-save',
    'data-agents-edit',
    'data-agents-delete',
    'data-agents-create',
    'data-agents-enabled-toggle',
  ];

  test('labels rows with Mesh agent badge', () => {
    expect(meshSectionHtml).toContain('data-mesh-badge');
    expect(meshSectionHtml).toContain('Mesh agent');
  });

  test('detail drawer shows name, description, url, skills', () => {
    expect(meshSectionHtml).toContain('data-mesh-detail');
    expect(meshSectionHtml).toContain('detailAgent.description');
    expect(meshSectionHtml).toContain('detailAgent.url');
    expect(meshSectionHtml).toContain('skill.name');
  });

  test('contains zero edit/save/delete affordances', () => {
    for (const attr of forbiddenAffordances) {
      expect(meshSectionHtml).not.toContain(attr);
    }
    expect(meshSectionHtml).not.toMatch(/@click="[^"]*(Save|Delete|Edit)/);
  });

  test('mixin exposes no mesh mutation calls', () => {
    expect(agentsMixinJs).not.toMatch(/\/mesh-agents'[^)]*\bmethod:\s*'(POST|PUT|PATCH|DELETE)'/);
  });
});

describe('Panel mixin', () => {
  test('is ESM with default export', () => {
    expect(agentsMixinJs).toContain('export default');
  });

  test('has no imports (browser-safe)', () => {
    expect(agentsMixinJs).not.toMatch(/\bimport\b/);
  });

  test('namespaces all state under data.agentMgr', () => {
    expect(agentsMixinJs).toContain('data.agentMgr = mgr');
    expect(agentsMixinJs).not.toMatch(/data\.agents\s*=/);
    expect(agentsMixinJs).not.toMatch(/data\.loading\s*=/);
    expect(agentsMixinJs).not.toMatch(/data\.error\s*=/);
  });

  test('exposes agentMgr* handlers for template bindings', () => {
    for (const fn of [
      'agentMgrLoadAgents',
      'agentMgrLoadMesh',
      'agentMgrRefresh',
      'agentMgrOpenCreate',
      'agentMgrOpenEdit',
      'agentMgrCloseDrawer',
      'agentMgrSave',
      'agentMgrToggle',
      'agentMgrDelete',
      'agentMgrOpenDetail',
      'agentMgrCloseDetail',
    ]) {
      expect(agentsMixinJs).toContain(`data.${fn} =`);
    }
  });

  test('initial load kicks off both sections', () => {
    expect(agentsMixinJs).toContain('data.agentMgrRefresh();');
  });
});

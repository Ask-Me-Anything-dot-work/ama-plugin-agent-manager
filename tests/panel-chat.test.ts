import { expect, test, describe } from 'bun:test';
import { agentsPanelHtml } from '../src/panels/template.js';
import { chatDrawerHtml } from '../src/panels/template-chat.js';
import { agentsMixinJs } from '../src/panels/mixin.js';

describe('Chat drawer', () => {
  const forbidden = /<!doctype|<html|<head|<body|<meta|<title|<style|<script/i;

  test('is a fragment with no document-level or sanitizer-stripped tags, no 100vh', () => {
    expect(forbidden.test(chatDrawerHtml)).toBe(false);
    expect(chatDrawerHtml.trimStart().startsWith('<div')).toBe(true);
    expect(chatDrawerHtml).not.toContain('100vh');
  });

  test('is composed into the panel template', () => {
    expect(agentsPanelHtml).toContain('data-chat-drawer');
  });

  test('has message list, input, send, running and error surfaces', () => {
    expect(chatDrawerHtml).toContain('data-chat-messages');
    expect(chatDrawerHtml).toContain('data-chat-input');
    expect(chatDrawerHtml).toContain('data-chat-send');
    expect(chatDrawerHtml).toContain('data-chat-running');
    expect(chatDrawerHtml).toContain('data-chat-error');
    expect(chatDrawerHtml).toContain('RUNNING…');
  });

  test('has history list + new conversation + single-turn copy', () => {
    expect(chatDrawerHtml).toContain('data-chat-history');
    expect(chatDrawerHtml).toContain('data-chat-history-item');
    expect(chatDrawerHtml).toContain('data-chat-new');
    expect(chatDrawerHtml).toContain('data-chat-singleturn-note');
    expect(chatDrawerHtml).toContain('independent turn');
  });

  test('renders user and assistant roles with pre-wrap content', () => {
    expect(chatDrawerHtml).toContain('data-chat-role');
    expect(chatDrawerHtml).toContain('whitespace-pre-wrap');
    expect(chatDrawerHtml).toContain("m.role === 'user' ? 'You' : 'Agent'");
  });
});

describe('Chat mixin state machine', () => {
  test('exposes chat handlers under data.agentMgr*', () => {
    for (const fn of [
      'agentMgrOpenChat',
      'agentMgrCloseChat',
      'agentMgrLoadChatSessions',
      'agentMgrOpenChatSession',
      'agentMgrNewConversation',
      'agentMgrSendChat',
      'agentMgrPollChatJob',
    ]) {
      expect(agentsMixinJs).toContain(`data.${fn} =`);
    }
  });

  test('chat state lives under mgr.chat and status never sticks in running', () => {
    expect(agentsMixinJs).toContain('mgr.chat = {');
    expect(agentsMixinJs).toMatch(/mgr\.chat\.status = 'error'/);
    expect(agentsMixinJs).toMatch(/mgr\.chat\.status = 'done'/);
    // Client poll is bounded: deadline forces error exit (no zombie running).
    expect(agentsMixinJs).toContain('Date.now() + 180000');
    expect(agentsMixinJs).toMatch(
      /if \(mgr\.chat\.status === 'running'\) \{\s*mgr\.chat\.error = 'Still running/,
    );
  });

  test('stays browser-safe: no imports in the composed mixin string', () => {
    expect(agentsMixinJs).not.toMatch(/\bimport\b/);
  });
});

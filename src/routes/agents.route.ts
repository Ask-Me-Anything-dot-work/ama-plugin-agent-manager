import { Hono } from 'hono';
import { agentsPanelHtml } from '../panels/template.js';
import { agentsMixinJs } from '../panels/mixin.js';

export function createAgentsRouter(): Hono {
  const router = new Hono();

  router.get('/health', (c) => c.json({ status: 'ok' }));

  // Stub — CRUD behavior is out of scope for the scaffold issue.
  router.get('/agents', (c) => c.json([]));

  router.get('/console/agents-panel.html', (c) => c.html(agentsPanelHtml));

  // Browser import() requires a JavaScript MIME type.
  router.get('/console/agents-mixin.js', (c) =>
    c.text(agentsMixinJs, 200, { 'Content-Type': 'text/javascript' }),
  );

  return router;
}

import { expect, test, describe } from 'bun:test';
import { createAgentsRouter } from '../src/routes/agents.route.js';

describe('Plugin routes', () => {
  const router = createAgentsRouter();

  test('GET /health returns ok', async () => {
    const res = await router.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  test('GET /agents returns empty stub list', async () => {
    const res = await router.request('/agents');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test('GET /console/agents-panel.html serves HTML fragment', async () => {
    const res = await router.request('/console/agents-panel.html');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const body = await res.text();
    expect(body).toContain('No agents yet');
  });

  test('GET /console/agents-mixin.js serves JavaScript MIME type', async () => {
    const res = await router.request('/console/agents-mixin.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/javascript');
    const body = await res.text();
    expect(body).toContain('export default');
  });
});

import { describe, expect, test } from 'bun:test';
import {
  CHAT_ENQUEUE_PATH,
  createOrchestratorChatClient,
  OrchestratorFetchError,
} from '../src/clients/orchestrator.client.js';

function stubFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const seen: { url: string; init: RequestInit }[] = [];
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, init: init ?? {} });
    return handler(url, init ?? {});
  };
  return { fetchFn: fetchFn as typeof fetch, seen };
}

function client(fetchFn: typeof fetch, consoleToken?: string, psk?: string) {
  return createOrchestratorChatClient({
    baseUrl: 'http://localhost:3100',
    consoleToken,
    psk,
    fetchFn,
  });
}

const payload = {
  agent_name: 'demo',
  instructions: 'do things',
  model: 'test-model',
  message: 'hello',
};

describe('orchestrator chat client — auth headers', () => {
  test('prefers X-Console-Token over PSK', async () => {
    const { fetchFn, seen } = stubFetch(() => Response.json({ job_id: 'j1' }));
    await client(fetchFn, 'tok', 'psk-value').enqueueChat(payload);
    const headers = seen[0].init.headers as Record<string, string>;
    expect(headers['X-Console-Token']).toBe('tok');
    expect(headers.Authorization).toBeUndefined();
  });

  test('falls back to Authorization Bearer PSK', async () => {
    const { fetchFn, seen } = stubFetch(() => Response.json({ job_id: 'j1' }));
    await client(fetchFn, undefined, 'psk-value').enqueueChat(payload);
    const headers = seen[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer psk-value');
  });

  test('neither token nor psk → 503, no network call', async () => {
    const { fetchFn, seen } = stubFetch(() => Response.json({ job_id: 'j1' }));
    const err = await client(fetchFn).enqueueChat(payload).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OrchestratorFetchError);
    expect((err as OrchestratorFetchError).status).toBe(503);
    expect(seen).toHaveLength(0);
  });
});

describe('orchestrator chat client — enqueueChat', () => {
  test('POST {baseUrl}/api/agents/chat with payload, returns job_id', async () => {
    const { fetchFn, seen } = stubFetch(() => Response.json({ job_id: 'job-1' }));
    const out = await client(fetchFn, 't').enqueueChat(payload);
    expect(out).toEqual({ job_id: 'job-1' });
    expect(seen[0].url).toBe(`http://localhost:3100${CHAT_ENQUEUE_PATH}`);
    expect(seen[0].init.method).toBe('POST');
    expect(JSON.parse(String(seen[0].init.body))).toEqual(payload);
  });

  test('tolerates { id } shape + trailing baseUrl slash', async () => {
    const { fetchFn, seen } = stubFetch(() => Response.json({ id: 'job-2' }));
    const c = createOrchestratorChatClient({
      baseUrl: 'http://host:3100/',
      consoleToken: 't',
      fetchFn,
    });
    expect(await c.enqueueChat(payload)).toEqual({ job_id: 'job-2' });
    expect(seen[0].url).toBe(`http://host:3100${CHAT_ENQUEUE_PATH}`);
  });

  test('missing job id in response → 502', async () => {
    const { fetchFn } = stubFetch(() => Response.json({}));
    const err = await client(fetchFn, 't').enqueueChat(payload).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OrchestratorFetchError);
    expect((err as OrchestratorFetchError).status).toBe(502);
  });

  test('non-2xx upstream → 502 with status in message', async () => {
    const { fetchFn } = stubFetch(() => new Response('bad', { status: 400 }));
    const err = await client(fetchFn, 't').enqueueChat(payload).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OrchestratorFetchError);
    expect((err as Error).message).toContain('400');
  });

  test('network failure → 502 OrchestratorFetchError', async () => {
    const { fetchFn } = stubFetch(() => {
      throw new TypeError('Connection refused');
    });
    const err = await client(fetchFn, 't').enqueueChat(payload).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OrchestratorFetchError);
  });
});

describe('orchestrator chat client — getJob', () => {
  test('GET /api/jobs/:id returns status/output/error', async () => {
    const { fetchFn, seen } = stubFetch(() =>
      Response.json({ status: 'done', output: 'reply', error: null }),
    );
    expect(await client(fetchFn, 't').getJob('job-1')).toEqual({
      status: 'done',
      output: 'reply',
      error: null,
    });
    expect(seen[0].url).toBe('http://localhost:3100/api/jobs/job-1');
  });

  test('normalizes missing fields to running/null', async () => {
    const { fetchFn } = stubFetch(() => Response.json({}));
    expect(await client(fetchFn, 't').getJob('j')).toEqual({
      status: 'running',
      output: null,
      error: null,
    });
  });

  test('poll-step transitions: pending → running → done', async () => {
    const states = ['pending', 'running', 'done'];
    let i = 0;
    const { fetchFn } = stubFetch(() => Response.json({ status: states[i++], output: 'ok' }));
    const c = client(fetchFn, 't');
    expect((await c.getJob('j')).status).toBe('pending');
    expect((await c.getJob('j')).status).toBe('running');
    expect((await c.getJob('j')).status).toBe('done');
  });

  test('failed snapshot carries error detail', async () => {
    const { fetchFn } = stubFetch(() =>
      Response.json({ status: 'failed', output: null, error: 'boom' }),
    );
    expect(await client(fetchFn, 't').getJob('j')).toEqual({
      status: 'failed',
      output: null,
      error: 'boom',
    });
  });
});

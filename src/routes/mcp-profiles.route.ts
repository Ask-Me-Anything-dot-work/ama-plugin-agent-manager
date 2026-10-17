import { Hono } from 'hono';
import {
  RegistryUnavailableError,
  type RegistryClient,
} from '../clients/registry.client.js';

// Slim projection only — never leak the PSK or full profile payload (D2).
export function createMcpProfilesRouter(client: RegistryClient): Hono {
  const router = new Hono();

  router.get('/mcp-profiles', async (c) => {
    try {
      const profiles = await client.listProfiles();
      return c.json({
        profiles: profiles.map((p) => ({
          id: p.id,
          label: p.label,
          description: p.description ?? null,
        })),
      });
    } catch (err) {
      if (err instanceof RegistryUnavailableError) {
        return c.json({ error: { code: err.code, message: err.message } }, 503);
      }
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } }, 500);
    }
  });

  return router;
}

import { z } from 'zod';

// Reserved for later issues (registry install source, HITL auth, console auth).
// Declared now so the config surface is stable; zero runtime use in v1.
export const pluginConfigSchema = z
  .object({
    REGISTRY_URL: z.string().url().optional(),
    REGISTRY_PSK: z.string().optional(),
    CONSOLE_TOKEN: z.string().optional(),
  })
  .strict();

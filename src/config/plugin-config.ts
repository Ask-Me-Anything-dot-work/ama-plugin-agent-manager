import { z } from 'zod';

// CONSOLE_TOKEN / ORCHESTRATOR_URL / DATABASE_URL consumed at runtime since #2;
// REGISTRY_URL / REGISTRY_PSK activated by #4 (profile picker + validation).
export const pluginConfigSchema = z
  .object({
    REGISTRY_URL: z.string().url().optional(),
    REGISTRY_PSK: z.string().optional(),
    CONSOLE_TOKEN: z.string().optional(),
    ORCHESTRATOR_URL: z.string().url().optional(),
    DATABASE_URL: z.string().optional(),
  })
  .strict();

export type PluginConfig = z.infer<typeof pluginConfigSchema>;

export const DEFAULT_ORCHESTRATOR_URL = 'http://localhost:3100';

export interface ResolvedRuntimeConfig {
  consoleToken: string | undefined;
  orchestratorUrl: string;
  databaseUrl: string | undefined;
  registryUrl: string | undefined;
  registryPsk: string | undefined;
}

export interface ConfigReader {
  getConfig<T>(): Promise<T>;
}

// Stored plugin config wins; process.env is the in-process fallback (ADR-002/D3).
function firstSet(...values: (string | undefined)[]): string | undefined {
  return values.find((v) => v !== undefined);
}

export function resolveRuntimeConfig(
  config: Partial<PluginConfig> | undefined,
  env: Record<string, string | undefined> = process.env,
): ResolvedRuntimeConfig {
  return {
    consoleToken: firstSet(config?.CONSOLE_TOKEN, env.CONSOLE_TOKEN),
    orchestratorUrl:
      firstSet(config?.ORCHESTRATOR_URL, env.ORCHESTRATOR_URL) ?? DEFAULT_ORCHESTRATOR_URL,
    databaseUrl: firstSet(config?.DATABASE_URL, env.DATABASE_URL),
    registryUrl: firstSet(config?.REGISTRY_URL, env.REGISTRY_URL),
    registryPsk: firstSet(config?.REGISTRY_PSK, env.REGISTRY_PSK),
  };
}

// Unparseable/foreign config shapes degrade to env fallbacks instead of failing start.
export async function loadPluginConfig(bridge: ConfigReader): Promise<Partial<PluginConfig>> {
  try {
    const raw = await bridge.getConfig<unknown>();
    const parsed = pluginConfigSchema.safeParse(raw);
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

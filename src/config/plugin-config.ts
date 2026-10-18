import { z } from 'zod';

// CONSOLE_TOKEN / ORCHESTRATOR_URL / DATABASE_URL are consumed at runtime
// since #2 (managed CRUD + mesh section); ORCHESTRATOR_PSK + CHAT_POLL_TIMEOUT_MS
// since #3 (chat proxy); REGISTRY_URL / REGISTRY_PSK activated by #4
// (profile picker + save-time validation).
export const pluginConfigSchema = z
  .object({
    REGISTRY_URL: z.string().url().optional(),
    REGISTRY_PSK: z.string().optional(),
    CONSOLE_TOKEN: z.string().optional(),
    ORCHESTRATOR_URL: z.string().url().optional(),
    ORCHESTRATOR_PSK: z.string().optional(),
    DATABASE_URL: z.string().optional(),
    CHAT_POLL_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  })
  .strict();

export type PluginConfig = z.infer<typeof pluginConfigSchema>;

export const DEFAULT_ORCHESTRATOR_URL = 'http://localhost:3100';
export const DEFAULT_CHAT_POLL_TIMEOUT_MS = 120_000;

export interface ResolvedRuntimeConfig {
  consoleToken: string | undefined;
  orchestratorUrl: string;
  orchestratorPsk: string | undefined;
  databaseUrl: string | undefined;
  registryUrl: string | undefined;
  registryPsk: string | undefined;
  chatPollTimeoutMs: number;
}

export interface ConfigReader {
  getConfig<T>(): Promise<T>;
}

function firstNonEmpty(...values: (string | undefined)[]): string | undefined {
  for (const value of values) {
    if (value) return value;
  }
  return undefined;
}

function resolvePollTimeout(
  config: Partial<PluginConfig> | undefined,
  env: Record<string, string | undefined>,
): number {
  if (config?.CHAT_POLL_TIMEOUT_MS !== undefined) return config.CHAT_POLL_TIMEOUT_MS;
  const fromEnv = env.CHAT_POLL_TIMEOUT_MS;
  if (fromEnv) {
    const parsed = Number(fromEnv);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_CHAT_POLL_TIMEOUT_MS;
}

// Stored plugin config wins; process.env is the in-process fallback (ADR-002/D3).

export function resolveRuntimeConfig(
  config: Partial<PluginConfig> | undefined,
  env: Record<string, string | undefined> = process.env,
): ResolvedRuntimeConfig {
  return {
    consoleToken: firstNonEmpty(config?.CONSOLE_TOKEN, env.CONSOLE_TOKEN),
    orchestratorUrl:
      firstNonEmpty(config?.ORCHESTRATOR_URL, env.ORCHESTRATOR_URL) ?? DEFAULT_ORCHESTRATOR_URL,
    orchestratorPsk: firstNonEmpty(config?.ORCHESTRATOR_PSK, env.ORCHESTRATOR_PSK),
    databaseUrl: firstNonEmpty(config?.DATABASE_URL, env.DATABASE_URL),
    registryUrl: firstNonEmpty(config?.REGISTRY_URL, env.REGISTRY_URL),
    registryPsk: firstNonEmpty(config?.REGISTRY_PSK, env.REGISTRY_PSK),
    chatPollTimeoutMs: resolvePollTimeout(config, env),
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

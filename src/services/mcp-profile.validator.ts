import type { RegistryClient } from '../clients/registry.client.js';

export type ProfileValidator = (id: string) => Promise<void>;

// Save-time rule (D3): a non-null mcp_profile_id must exist in the registry
// (GET /profiles/:id → 200). 404 → ProfileNotFoundError ("Profile not found in
// registry"); outage/auth/timeout → RegistryUnavailableError (fail-closed).
// Callers skip this for null ids (D4).
export function createMcpProfileValidator(
  client: Pick<RegistryClient, 'getProfile'>,
): ProfileValidator {
  return (id: string) => client.getProfile(id).then(() => undefined);
}

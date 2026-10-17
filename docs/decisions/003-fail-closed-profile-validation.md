# ADR-003: Fail-closed MCP profile validation via server-side registry proxy

**Status:** accepted
**Date:** 2026-10-17

## Context

Issue #4 requires every managed agent's `mcp_profile_id` to be an explicit, validated assignment — no silent defaults, no `repo_name` fallback. The registry (`ama-mcp-registry`) exposes `GET /profiles` and `GET /profiles/:id` behind `REGISTRY_PSK` bearer auth. The console browser must never see the PSK, so all registry traffic has to go through the plugin's server. Saves carrying a profile must not persist when the id is unknown or the registry is unreachable ("fail-closed, never silently accepted").

## Decision

1. **Server-side proxy** (`GET /mcp-profiles` → `{ profiles: [{ id, label, description }] }`): the only registry read path exposed to the browser. Slim projection; PSK and full profile payload stay server-side. No caching and no ETag passthrough — every call live-fetches so newly created registry profiles appear on refresh (registry list is tiny; revisit if it grows).
2. **Fail-closed save validation**: on create and full PUT, a non-null `mcp_profile_id` must return 200 from `GET /profiles/:id`. 404 → `400 PROFILE_NOT_FOUND` ("Profile not found in registry"), row not saved. Network/timeout/5xx/401/403/missing config → `503 REGISTRY_UNAVAILABLE` with an actionable message naming `REGISTRY_URL`/`REGISTRY_PSK`, row not saved. 400 vs 503 separates bad input from infra fault.
3. **Profile is optional**: `null`/cleared field skips validation and persists `null` (spawn with null profile = no MCP tools — defined behavior). `PATCH /agents/:id` (enabled toggle) never re-validates.

## Consequences

- Registry outage blocks saves that carry a profile; null-profile saves are unaffected. Intentional friction per the issue's fail-closed mandate.
- Missing `REGISTRY_URL`/`REGISTRY_PSK` (config row or env) yields proxy 503 and fail-closed saves — never a silent default.
- A registry-deleted profile stays visible on the row as a stale "(missing: id)" picker option (read path unvalidated by design) and is rejected at the next full save. No auto-prune.
- If an orchestrator-core or bridge-level registry accessor ever lands in `ama-plugin-contract`, the proxy half of this ADR should be revisited (validation semantics stay).

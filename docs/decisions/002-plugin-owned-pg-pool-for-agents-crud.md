# ADR-002: Plugin-owned pg pool for agents CRUD

**Status:** accepted
**Date:** 2026-10-17

## Context

Managed-agent CRUD (#2) needs direct SQL access to the plugin-owned `agents` table. The published contract (`@ama-work/plugin-contract@1.0.1`) exposes **no SQL/query accessor** on `PluginBridge` — only `runMigrations` and `getConfig`/`saveConfig` (the orchestrator's `OrchestratorBridge` holds `DatabaseService` privately). Extending the contract with `bridge.query` would require coordinated releases of `ama-plugin-contract` **and** `ama-agent-orchestrator` before this issue could ship — wrong sequencing for a feature that must stay inside this repo.

The hard boundary (`tests/boundary.test.ts`) forbids importing orchestrator `src/core` (where `DatabaseService` lives), so an HTTP workaround is not available either.

## Decision

The plugin owns its own `pg` connection pool behind an `AgentsRepository` port (`PgAgentsRepository` in `src/repositories/agents.repository.ts`, in-memory fake in `tests/helpers/agents-repo.ts`).

DSN resolution precedence: plugin config `DATABASE_URL` → `process.env.DATABASE_URL` → `POSTGRES_USER`/`PROJECT_NAME` + `POSTGRES_PASSWORD` + `PGDATABASE` (+ optional `POSTGRES_HOST`/`POSTGRES_PORT`) — mirrors the orchestrator `DatabaseService` fallback, valid because the plugin runs in-process with the orchestrator (systemd bare host).

Pool lifecycle: created lazily on first query (plugin start never fails on a missing DSN; the first agents request surfaces a clear error), closed in `onStop`.

## Consequences

- The plugin ships without cross-repo contract releases and stays within the boundary (no orchestrator `src/core` imports).
- Deployment must give the plugin process the Postgres DSN via config or env — true for the standard in-process deploy; documented in README.
- If a `bridge.query` (or db-handle) extension lands in `ama-plugin-contract` + orchestrator, this ADR should be superseded and the pool replaced with the bridge accessor.
- **Mapper duplication:** `src/mappers/mesh-agent.mapper.ts` intentionally duplicates the skill transform of the orchestrator's `agent-card.service.ts` (boundary forbids importing it). Unit tests pin the semantics (`ama-` prefix strip, snake id / spaced name / `description: null`); divergence risk accepted until a shared mapper exists in the contract.
- **Plugin routes are unauthenticated** at the orchestrator layer (`/plugins/*` dispatcher has no `consoleAuth`). Anyone with network reach can mutate `agents`. Out of scope to fix here; tracked as a recommended follow-up on ama-agent-orchestrator (wrap `/plugins/*` in `consoleAuth`). Documented as a README caveat.

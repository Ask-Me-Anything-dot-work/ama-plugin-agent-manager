# @ama-work/agent-manager

Agent Manager plugin for `ama-agent-orchestrator`.

Provides the **Agents** console panel — a single pane of glass with full CRUD over GUI-managed agents (plugin-owned `agents` table) plus a read-only **Mesh agents** section synthesized from repo-registered agents — together with the plugin routes behind both.

- Plugin id: `agent-manager`
- npm package: `@ama-work/agent-manager`
- Parent epic: [ama-shared-context#184](https://github.com/Ask-Me-Anything-dot-work/ama-shared-context/issues/184)
- Plugin host: [ama-agent-orchestrator#264](https://github.com/Ask-Me-Anything-dot-work/ama-agent-orchestrator/issues/264)
- Contract: [ama-plugin-contract](https://github.com/Ask-Me-Anything-dot-work/ama-plugin-contract)

## Local development

```bash
bun install
bun run lint    # eslint + tsc --noEmit + knip
bun test
bun run build   # → dist/
```

## Panel behavior

**Managed agents** (rows in the plugin-owned `agents` table, plugin-owned lifecycle):

- Table: name, description, model, mcp profile, enabled toggle, edit/delete actions. Rows carry a **Managed agent** badge.
- **Create agent** opens a drawer form: name, description, instructions (textarea), model, MCP profile picker, enabled. Save posts to the plugin REST API; 400/409/502/503 errors render in the drawer's error area.
- **MCP profile picker** (issue #4): a `<select>` populated server-side from `GET /mcp-profiles` (plugin proxy over the registry's `GET /profiles`; PSK never reaches the browser). Options show `label — description`; **"None (no MCP tools)"** clears the field (profile optional, persists `null`). Profiles load on drawer open; **Refresh profiles** re-fetches live (no cache), so newly created registry profiles appear immediately. Empty registry → explanatory copy pointing at the MCP Registry console + disabled select (save-with-None still allowed). A stale id on the row renders as a selected `(missing: id)` option — visible, never silently dropped.
- **Save-time validation** (fail-closed): a non-null profile id must exist in the registry (`GET /profiles/:id` → 200). Unknown/stale id → `400 PROFILE_NOT_FOUND` ("Profile not found in registry"), row not saved. Registry unreachable/unconfigured → `503 REGISTRY_UNAVAILABLE` with an actionable message naming `REGISTRY_URL`/`REGISTRY_PSK`, row not saved. Clearing to null skips validation; the enabled toggle (`PATCH`) never re-validates.
- **Edit** reopens the drawer prefilled; **Save** PUTs. The enabled checkbox PATCHes `{enabled}` and persists. **Delete** removes the row.
- Validation (server authoritative): `name` required + unique (409 `NAME_TAKEN`), `instructions` required, `model` required; description/mcp_profile_id nullable.
- Empty DB shows "No agents yet"; core/DB failures render an inline error banner (no crash).

**Mesh agents** (repo-derived, read-only — visibility now, cluster participation later):

- Sourced server-side from `GET /api/repos` (auth stays server-side: `X-Console-Token` with `CONSOLE_TOKEN`); mapped to the AgentCard `skills[]` shape (`id` snake_case, spaced `name`, `description: null`).
- Rows carry a **Mesh agent** badge + muted styling. **View** opens a detail drawer: name, description, url, skills list. **Zero edit/save/delete affordances** — enforced by `tests/panel.test.ts`.
- 502 `CORE_UNREACHABLE` when the orchestrator is down; 503 `CONSOLE_TOKEN_MISSING` when no token is configured.

**Refresh**: manual refresh button re-fetches both sections.

## Install into a running orchestrator

Distribution: this package publishes to **public npm** via semantic-release; the orchestrator installer pulls it through the Verdaccio npmjs uplink proxy (`PLUGIN_REGISTRY_URL`, default `http://verdaccio.homelab`). No Verdaccio credentials needed (see `docs/decisions/001`).

```bash
# 1. Confirm the package is resolvable through Verdaccio (uplink cache may lag right after publish; retry or purge if 404)
curl -s http://verdaccio.homelab/@ama-work/agent-manager/latest | jq '{version}'

# 2. Install
curl -s -X POST localhost:3100/api/plugins/install \
  -H 'Content-Type: application/json' \
  -d '{"id":"@ama-work/agent-manager"}' | jq

# 3. Verify loaded + panel registered
curl -s localhost:3100/api/plugins | jq '.[] | select(.id=="@ama-work/agent-manager")'
# expect: status loaded, panels[0].id == "agents"

# 4. Enable / disable round-trip (restart-acceptable per #264 v1)
curl -s -X POST localhost:3100/api/plugins/disable/@ama-work/agent-manager | jq
curl -s -X POST localhost:3100/api/plugins/enable/@ama-work/agent-manager | jq

# 5. Verify migration landed
psql -c "SELECT * FROM plugin_migrations WHERE plugin_id LIKE '%agent-manager%'"
psql -c '\d agents'
```

Console: after enable, an **Agents** nav tab appears with the managed table and read-only mesh section.

## Manual verification (CRUD persistence + mesh)

```bash
# Create → 201
curl -s -X POST localhost:3100/plugins/@ama-work/agent-manager/agents \
  -H 'Content-Type: application/json' \
  -d '{"name":"demo","instructions":"do","model":"test"}' | jq

# List shows the row; still there after orchestrator restart (persistence AC)
curl -s localhost:3100/plugins/@ama-work/agent-manager/agents | jq
sudo systemctl restart ama-orchestrator && curl -s localhost:3100/plugins/@ama-work/agent-manager/agents | jq

# Mesh agents (needs CONSOLE_TOKEN; see config below)
curl -s localhost:3100/plugins/@ama-work/agent-manager/mesh-agents | jq

# MCP profile picker (needs REGISTRY_URL/REGISTRY_PSK; see config below)
curl -s localhost:3100/plugins/@ama-work/agent-manager/mcp-profiles | jq
# stale id → 400 PROFILE_NOT_FOUND, row not saved:
curl -s -X POST localhost:3100/plugins/@ama-work/agent-manager/agents \
  -H 'Content-Type: application/json' \
  -d '{"name":"x","instructions":"do","model":"m","mcp_profile_id":"stale-id"}' | jq
```

## Plugin routes

Mounted under `/plugins/@ama-work/agent-manager/`:

| Route | Response |
|---|---|
| `GET /health` | `{ "status": "ok" }` |
| `GET /agents` | `ManagedAgent[]` |
| `POST /agents` | `201 ManagedAgent` \| `400 VALIDATION_ERROR` \| `400 PROFILE_NOT_FOUND` \| `409 NAME_TAKEN` \| `503 REGISTRY_UNAVAILABLE` |
| `GET /agents/:id` | `ManagedAgent` \| `404 AGENT_NOT_FOUND` |
| `PUT /agents/:id` | `ManagedAgent` \| `400` \| `404` \| `409` \| `503 REGISTRY_UNAVAILABLE` |
| `PATCH /agents/:id` | `ManagedAgent` — body `{ "enabled": boolean }` \| `400` \| `404` |
| `DELETE /agents/:id` | `204` \| `404` |
| `GET /mesh-agents` | `MeshAgentView[]` \| `502 CORE_UNREACHABLE` \| `503 CONSOLE_TOKEN_MISSING` |
| `GET /mcp-profiles` | `{ profiles: [{ id, label, description }] }` \| `503 REGISTRY_UNAVAILABLE` |
| `GET /console/agents-panel.html` | HTML fragment |
| `GET /console/agents-mixin.js` | ESM mixin (`text/javascript`) |

> **Security caveat:** plugin routes are currently **unauthenticated** at the orchestrator layer (`/plugins/*` dispatcher has no `consoleAuth`). Anyone with network reach can mutate `agents`. Fix belongs in ama-agent-orchestrator (wrap `/plugins/*` in `consoleAuth`); see `docs/decisions/002`.

## Configuration

Precedence: **plugin config row → process env → default** (in-process deploy needs zero config). Set plugin config via `UPDATE plugins SET config = …` (no console UI yet).

| Key | Runtime since | Fallback | Purpose |
|---|---|---|---|
| `CONSOLE_TOKEN` | #2 | `process.env.CONSOLE_TOKEN` | `X-Console-Token` for server-side `GET /api/repos` mesh fetch. Missing both → mesh section 503. |
| `ORCHESTRATOR_URL` | #2 | `process.env.ORCHESTRATOR_URL` → `http://localhost:3100` | Base URL for mesh fetch + synthesized agent URLs. |
| `DATABASE_URL` | #2 | `process.env.DATABASE_URL` → `POSTGRES_USER`/`PROJECT_NAME` + `POSTGRES_PASSWORD` + `PGDATABASE` (`POSTGRES_HOST`/`POSTGRES_PORT`, defaults `localhost:5432`) | Postgres DSN for the plugin-owned pool (ADR-002). |
| `REGISTRY_URL` | #4 | `process.env.REGISTRY_URL` | Base URL of `ama-mcp-registry` (e.g. `http://localhost:3303`). Missing both → `/mcp-profiles` 503 + fail-closed saves carrying a profile (ADR-003). |
| `REGISTRY_PSK` | #4 | `process.env.REGISTRY_PSK` | Registry auth pre-shared key (`Authorization: Bearer`). Stays server-side; never returned to the browser. |

## Release

Single publish path: semantic-release runs on push to `main` (GitHub Actions) and publishes to npmjs.org. PR squash titles MUST be conventional (`feat:`/`fix:`) or no release is cut. Never publish manually; never hand-bump the version. See `AGENTS.md` §5.

## License

MIT

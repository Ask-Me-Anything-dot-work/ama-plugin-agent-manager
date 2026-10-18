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

**Chat (managed agents only — issue #3):**

- Each managed row has a **Chat** action → chat drawer: message list, input + Send, `RUNNING…` indicator while the job runs, inline error banner for enqueue failures, error excerpt (first ~500 chars) for job failures. No zombie "running" state — the drawer's client poll is deadline-bounded and exits to `error`.
- One `POST …/chat` does the full turn server-side (enqueue → bounded poll `CHAT_POLL_TIMEOUT_MS` → reply). On poll timeout the response carries `status:'running'` + `job_id`; the drawer resumes via `GET …/chat/jobs/:jobId` until terminal.
- **History** is plugin-private (`agent_sessions` + `agent_messages`, migration 002): the drawer lists past conversations (last-message preview + timestamp), reopening loads the full transcript. **New conversation** starts a fresh session. History survives console reload and is scoped per agent; deleting an agent cascades its sessions and messages (FK `ON DELETE CASCADE`).
- **Single-turn (v1):** ama-agent-orchestrator#687 multi-turn `session_id` is not wired into the enqueue payload yet — each message is an independent orchestrator job and the drawer says so. When #687 ships multi-turn, the switch is one line in `toEnqueuePayload` (ADR-003/D7).
- Job failures never write a fake assistant message (user message survives; assistant row is written once per job, on success only).

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

## Manual verification (chat + history)

```bash
# Chat turn: reply when the job finishes fast; otherwise {status:'running', job_id} → resume
curl -s -X POST localhost:3100/plugins/@ama-work/agent-manager/agents/<id>/chat \
  -H 'Content-Type: application/json' -d '{"message":"hello"}' | jq

# Resume a running turn
curl -s localhost:3100/plugins/@ama-work/agent-manager/agents/<id>/chat/jobs/<job_id> | jq

# History: list + transcript (intact after orchestrator restart / console reload)
curl -s localhost:3100/plugins/@ama-work/agent-manager/agents/<id>/chat/sessions | jq
curl -s localhost:3100/plugins/@ama-work/agent-manager/agents/<id>/chat/sessions/<sid> | jq

# Failure path: stop the orchestrator/EE mid-run → error excerpt in the drawer, no zombie running
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
| `POST /agents/:id/chat` | `{ session_id, job_id, status, reply?, error? }` — body `{ "message", "session_id?" }` \| `400` \| `404` \| `502 ORCHESTRATOR_UNREACHABLE` \| `503 NO_AUTH_CONFIG` |
| `GET /agents/:id/chat/sessions` | `ChatSessionSummary[]` (preview + activity order) \| `404` |
| `GET /agents/:id/chat/sessions/:sid` | `{ session, messages[] }` transcript \| `404 SESSION_NOT_FOUND` |
| `GET /agents/:id/chat/jobs/:jobId` | `{ job_id, status, reply?, error? }` — resume/refresh poll \| `404 JOB_NOT_FOUND` |
| `GET /mesh-agents` | `MeshAgentView[]` \| `502 CORE_UNREACHABLE` \| `503 CONSOLE_TOKEN_MISSING` |
| `GET /mcp-profiles` | `{ profiles: [{ id, label, description }] }` \| `503 REGISTRY_UNAVAILABLE` |
| `GET /console/agents-panel.html` | HTML fragment |
| `GET /console/agents-mixin.js` | ESM mixin (`text/javascript`) |

> **Security caveat:** plugin routes are currently **unauthenticated** at the orchestrator layer (`/plugins/*` dispatcher has no `consoleAuth`). Anyone with network reach can mutate `agents` **and drive agent execution via `POST …/chat`**. Fix belongs in ama-agent-orchestrator (wrap `/plugins/*` in `consoleAuth`); see `docs/decisions/002` and `docs/decisions/003`.

## Configuration

Precedence: **plugin config row → process env → default** (in-process deploy needs zero config). Set plugin config via `UPDATE plugins SET config = …` (no console UI yet).

| Key | Runtime since | Fallback | Purpose |
|---|---|---|---|
| `CONSOLE_TOKEN` | #2 | `process.env.CONSOLE_TOKEN` | `X-Console-Token` for server-side orchestrator calls (mesh fetch + chat enqueue/poll). Missing both + no PSK → mesh 503 / chat 503 `NO_AUTH_CONFIG`. |
| `ORCHESTRATOR_URL` | #2 | `process.env.ORCHESTRATOR_URL` → `http://localhost:3100` | Base URL for mesh fetch + chat proxy + synthesized agent URLs. |
| `DATABASE_URL` | #2 | `process.env.DATABASE_URL` → `POSTGRES_USER`/`PROJECT_NAME` + `POSTGRES_PASSWORD` + `PGDATABASE` (`POSTGRES_HOST`/`POSTGRES_PORT`, defaults `localhost:5432`) | Postgres DSN for the plugin-owned pool (ADR-002). |
| `ORCHESTRATOR_PSK` | #3 | `process.env.ORCHESTRATOR_PSK` | `Authorization: Bearer` fallback when `CONSOLE_TOKEN` is unset (chat client). |
| `CHAT_POLL_TIMEOUT_MS` | #3 | `process.env.CHAT_POLL_TIMEOUT_MS` → `120000` | Server-side per-turn poll bound for `POST …/chat`; on expiry the response returns `status:'running'` + `job_id` for client resume. |
| `REGISTRY_URL` | #4 | `process.env.REGISTRY_URL` | Base URL of `ama-mcp-registry` (e.g. `http://localhost:3303`). Missing both → `/mcp-profiles` 503 + fail-closed saves carrying a profile (ADR-004). |
| `REGISTRY_PSK` | #4 | `process.env.REGISTRY_PSK` | Registry auth pre-shared key (`Authorization: Bearer`). Stays server-side; never returned to the browser. |

## Release

Single publish path: semantic-release runs on push to `main` (GitHub Actions) and publishes to npmjs.org. PR squash titles MUST be conventional (`feat:`/`fix:`) or no release is cut. Never publish manually; never hand-bump the version. See `AGENTS.md` §5.

## License

MIT

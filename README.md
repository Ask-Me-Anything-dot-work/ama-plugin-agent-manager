# @ama-work/agent-manager

Agent Manager plugin for `ama-agent-orchestrator`.

Provides the **Agents** console panel (empty-state scaffold), a plugin-owned `agents` table migration, and plugin routes. Later issues add CRUD, mesh-agent visibility, chat/execution, and MCP profile assignment.

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

## Install into a running orchestrator

Distribution: this package publishes to **public npm** via semantic-release; the orchestrator installer pulls it through the Verdaccio npmjs uplink proxy (`PLUGIN_REGISTRY_URL`, default `http://verdaccio.homelab`). No Verdaccio credentials needed (see `docs/decisions/001`).

After the first `feat:` merge to `main` cuts a release:

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

Console: after enable, an **Agents** nav tab appears; the panel shows the empty state "No agents yet".

## Plugin routes

Mounted under `/plugins/@ama-work/agent-manager/`:

| Route | Response |
|---|---|
| `GET /health` | `{ "status": "ok" }` |
| `GET /agents` | `[]` (stub — CRUD later) |
| `GET /console/agents-panel.html` | HTML fragment (empty state) |
| `GET /console/agents-mixin.js` | ESM mixin (`text/javascript`) |

## Reserved plugin config

Declared in the config schema (`src/config/plugin-config.ts`), **not used at runtime yet**:

| Key | Purpose (later issues) |
|---|---|
| `REGISTRY_URL` | Registry source override for installs |
| `REGISTRY_PSK` | Registry auth pre-shared key |
| `CONSOLE_TOKEN` | Console auth token |

## Release

Single publish path: semantic-release runs on push to `main` (GitHub Actions) and publishes to npmjs.org. PR squash titles MUST be conventional (`feat:`/`fix:`) or no release is cut. Never publish manually; never hand-bump the version. See `AGENTS.md` §5.

## License

MIT

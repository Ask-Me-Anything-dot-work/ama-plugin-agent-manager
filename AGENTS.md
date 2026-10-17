# AGENTS.md

## 1. Purpose
Interaction protocol for AI agents and human contributors. Always loaded into agent sessions.

This repo is the **Agent Manager** Orchestrator plugin (`@ama-work/agent-manager`, plugin id `agent-manager`): the Agents console panel, plugin-owned `agents` migration, and plugin routes. Foundation for every later Agent Manager issue.

- Parent epic: [ama-shared-context#184](https://github.com/Ask-Me-Anything-dot-work/ama-shared-context/issues/184)
- Plugin host epic: [ama-agent-orchestrator#264](https://github.com/Ask-Me-Anything-dot-work/ama-agent-orchestrator/issues/264)
- Contract: [`@ama-work/plugin-contract`](https://github.com/Ask-Me-Anything-dot-work/ama-plugin-contract)

## 2. Tech Stack
- **Bun**: runtime, package manager, test runner.
- **TypeScript**: strict, `moduleResolution: bundler`.
- **Hono**: plugin HTTP routes (health, agents stub, panel assets).
- **Zod**: reserved plugin config schema.
- **Lint**: `eslint` + `tsc --noEmit` + `knip`.
- **Test**: `bun test` (MockBridge-based).
- **CI/Release**: GitHub Actions; semantic-release → public npm on push to `main`.
- **Hooks**: Husky (commit-msg → commitlint, pre-commit → lint+test).

## 3. Project Structure
- `src/index.ts` — entrypoint; named `plugin` export is the orchestrator loader contract (`mod.plugin ?? mod.default`, ama-agent-orchestrator#642). `onStart` runs migrations, mounts the Agents panel and plugin routes.
- `src/manifest.ts` — typed `PluginManifest`; version read from `package.json` (semantic-release-owned).
- `src/config/plugin-config.ts` — reserved config keys (`REGISTRY_URL`, `REGISTRY_PSK`, `CONSOLE_TOKEN`); declared, not used at runtime yet.
- `src/panels/` — panel descriptor + embedded HTML template and ESM mixin strings.
- `src/routes/agents.route.ts` — plugin router (`/health`, `/agents` stub, console assets).
- `migrations/001_create_agents.sql` — v1 `agents` table. **Deferred columns (do not add):** `skills[]`, `blocking`, `timeoutSeconds`, `nodeAffinity`.
- `tests/` — unit tests incl. `boundary.test.ts` (import allowlist: `@ama-work/plugin-contract`, `hono`, `zod`, `node:*`, relative). Zero orchestrator `src/core` imports — hard boundary.
- `docs/decisions/` — ADRs.

## 4. Standard Workflows
### Canonical Commands
- **Setup**: `bun install` (or `./bootstrap.sh`)
- **Dev**: `bun run dev`
- **Lint**: `bun run lint` (`eslint . && tsc --noEmit && knip`)
- **Test**: `bun test`
- **Build**: `bun run build` (→ `dist/`)

### Agentic Implementation Expectations
1. Always run `bun run lint` before `bun test`.
2. Fix all lint/test failures before opening a PR.
3. If unfixable in-session: post complete failure output on the issue and STOP — do not open a PR.
4. Read all accepted ADRs in `docs/decisions/` before planning.

## 5. Release Rules (load-bearing)
- **One publish path**: semantic-release in GitHub Actions on push to `main` → npmjs. Verdaccio serves via its npmjs uplink proxy. No Verdaccio credentials anywhere.
- **PR squash title MUST be conventional** (`feat:`/`fix:`) or semantic-release skips the release entirely (ama-hello-world lesson).
- **Never** publish manually (`npm publish`), never hand-bump `package.json` version, never add `publish:npm`/`publish:verdaccio` scripts (npm ≥ 9 `publishConfig.registry` overrides `--registry` — trap, ama-hello-world#17).
- `plugin.json` `version` field is identity metadata only; the runtime manifest version always flows from `package.json`.

## 6. Coding Conventions
- Small focused modules; files >150 lines or functions >50 lines fail lint (`max-lines`).
- Panel template must be an HTML **fragment** (no `<!doctype>`, `<html>`, `<head>`, `<body>`, `<style>`, `<script>`, no `100vh`) — console injects via `innerHTML`.
- Mixin route MUST serve `Content-Type: text/javascript` — browser `import()` requires a JS MIME type.
- Panel asset URLs are absolute paths under `/plugins/@ama-work/agent-manager/…`.
- No side effects at import time.

## 7. When Changing Protocols
Public-behavior changes (entrypoint shape, config keys, response shapes) require updating this file and matching tests in the same PR.

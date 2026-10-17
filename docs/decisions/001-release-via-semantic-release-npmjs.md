# ADR-001: Release via semantic-release to npmjs; Verdaccio serves via uplink proxy

**Status:** accepted
**Date:** 2026-10-17

## Context

The orchestrator plugin installer (`PluginLifecycleService.installLatest`) resolves plugin tarballs from `PLUGIN_REGISTRY_URL` (default `http://verdaccio.homelab`, the mesh-private registry). This repo must also be a **public** npm package (`@ama-work/agent-manager`). Issue #1 flagged the ambiguity: publish to Verdaccio directly, or publish to npmjs and let Verdaccio proxy?

ama-agent-orchestrator#264 documents the intended path: install pulls tarballs from Verdaccio, "which proxies npmjs.org". The proven reference implementation (`ama-hello-world`) uses exactly one publish path: semantic-release on push to `main` → npmjs; Verdaccio serves through its npmjs uplink. It deliberately removed `publish:npm`/`publish:verdaccio` scripts because npm ≥ 9 `publishConfig.registry` overrides `--registry`, making dual-registry scripts a silent trap (ama-hello-world#17).

## Decision

Publish to **public npm only**, via semantic-release in GitHub Actions on push to `main`. The orchestrator installer continues to pull through the Verdaccio npmjs uplink proxy at `http://verdaccio.homelab`. No Verdaccio credentials exist in this repo; no dual-registry publish scripts.

## Consequences

- `NPM_TOKEN` (and `GITHUB_TOKEN`) must exist as repo secrets before the first release.
- No manual publish path — the only release lever is a conventional commit (`feat:`/`fix:`) merged to `main`. A non-conventional squash subject silently skips the release (ama-hello-world lesson).
- Right after first publish, Verdaccio uplink cache may lag; install may 404 briefly (documented in README — retry or purge).
- Later install-source flexibility (direct-registry flag, `REGISTRY_URL` config key) stays reserved in the plugin config schema; not implemented here.

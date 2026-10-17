# ADR-003: Chat history model and synchronous poll with resume valve

**Status:** accepted
**Date:** 2026-10-17

## Context

Issue #3 requires a chat loop from the Agents panel: send a message to a managed agent, watch the reply, and reopen past conversations. The orchestrator side (ama-agent-orchestrator#687) is contractually a fire-and-forget enqueue (`{agent_name, instructions, model, mcp_profile_id?, message, session_id?}` → job id) plus `GET /api/jobs/:id` polling — there is no streaming callback into the plugin, and #687's endpoint path, auth mechanism, and `session_id` multi-turn support were all undecided when this plugin shipped. History must stay plugin-private (`agent_sessions` + `agent_messages`); core stays payload-only.

## Decision

1. **One POST does the turn, with a bounded server-side poll and a resume valve.** `POST /agents/:id/chat` enqueues, polls `GET /api/jobs/:id` (~2s interval, `CHAT_POLL_TIMEOUT_MS`, default 120s), persists the assistant message on `done`, and returns `{session_id, job_id, status, reply?, error?}`. `job_id` is always present. On poll timeout the response is `{status:'running', job_id}` and the client resumes via `GET /agents/:id/chat/jobs/:jobId` (same idempotent poll step) until terminal. This keeps the common case a single round-trip while never stranding a long job behind a dead fetch.
2. **`agent_sessions` = one row per conversation** (`id` = plugin UUID, `job_id` = latest turn, `parent_session_id` reserved NULL in v1). Messages are `agent_messages` rows (`role user|assistant`) ordered by `created_at`. Reopening a transcript is one query; "new conversation" is client-side only (omit `session_id`, server creates a session).
3. **Failure persistence is asymmetric.** The user message is written at turn start (survives failure); the assistant message is written only on `done`. Job failures surface as a ~500-char error excerpt inline — never a fake assistant message. The schema has no error role; a failed turn reopens as a lone user message (accepted v1 trade-off).
4. **Write-once guard on the assistant message**, keyed by `job_id` (partial unique index `idx_agent_messages_assistant_job`). POST-poll and resume-poll races cannot duplicate the reply.
5. **Orchestrator client auth is console-auth compatible:** `X-Console-Token` (plugin `CONSOLE_TOKEN`) with `Authorization: Bearer <ORCHESTRATOR_PSK>` fallback; missing both → 503 `NO_AUTH_CONFIG`. The enqueue path constant (`/api/agents/chat`) is isolated in `src/clients/orchestrator.client.ts` for a one-line change when #687 settles.
6. **Multi-turn is cut (D7).** `session_id` is omitted from the enqueue payload until #687 ships it; each message is an independent orchestrator job and the drawer states so in UI copy.

## Consequences

- Long turns cannot zombie the UI: every state-machine path exits `running` (timeout → client resume poll with a hard 180s deadline → error).
- Deleting an agent cascades its sessions and messages (FK `ON DELETE CASCADE`) — history cannot orphan the panel.
- Plugin routes remain unauthenticated at the orchestrator layer (carried from ADR-002); the chat proxy therefore exposes agent execution to anyone with network reach. Recommended follow-up: wrap `/plugins/*` in `consoleAuth` (ama-agent-orchestrator).
- When #687 lands multi-turn, the switch is: include `session_id` in the enqueue payload (one line in `toEnqueuePayload`) and drop the single-turn UI copy.
- The turn-chaining alternative (one session row per job, `parent_session_id` linking thread turns) was rejected for v1: `parent_session_id` would have been load-bearing only if multi-turn was cut *and* per-turn rows were wanted; the conversation-per-session model keeps the transcript query trivial and matches the issue schema literally.

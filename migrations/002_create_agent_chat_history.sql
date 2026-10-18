-- Chat history v1 (issue #3): plugin-private conversation store.
-- Cascade (D4): deleting an agent removes its sessions; deleting a session
-- removes its messages. parent_session_id reserved for fork/branch (always
-- NULL in v1). job_id = latest turn's job id (correlation + resume).
CREATE TABLE IF NOT EXISTS agent_sessions (
  id                TEXT PRIMARY KEY,
  agent_id          TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  parent_session_id TEXT REFERENCES agent_sessions(id) ON DELETE CASCADE,
  job_id            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_agent
  ON agent_sessions (agent_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_messages (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content    TEXT NOT NULL,
  -- Turn correlation: assistant rows are written once per job (write-once
  -- guard, plan T3). User rows leave it NULL (written before enqueue).
  job_id     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_messages_session
  ON agent_messages (session_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_messages_assistant_job
  ON agent_messages (job_id) WHERE role = 'assistant' AND job_id IS NOT NULL;

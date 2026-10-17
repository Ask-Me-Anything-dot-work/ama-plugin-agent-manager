-- v1 columns only. skills[], blocking, timeoutSeconds, nodeAffinity
-- are explicitly deferred to later issues — do not add "just in case".
CREATE TABLE IF NOT EXISTS agents (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL UNIQUE,
  description    TEXT,
  instructions   TEXT NOT NULL,
  model          TEXT NOT NULL,
  mcp_profile_id TEXT,
  enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

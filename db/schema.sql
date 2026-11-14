-- Shared by the Next.js app (lib/db.ts) and the Python worker (worker/db.py).
-- Every statement must be idempotent: both sides run this file on startup.

CREATE TABLE IF NOT EXISTS projects (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  artist       TEXT NOT NULL DEFAULT '',
  preset       TEXT NOT NULL DEFAULT 'melodic',
  mode         TEXT NOT NULL DEFAULT 'hybrid',
  vibe         TEXT NOT NULL DEFAULT '',
  audio_file   TEXT,               -- filename inside projects/<id>/
  playback_file TEXT,              -- browser-playable copy (only differs for AIFF)
  duration     REAL,
  bpm          REAL,
  musical_key  TEXT,
  status       TEXT NOT NULL DEFAULT 'new',   -- new | uploaded | analyzing | analyzed | error
  spend_usd    REAL NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS project_assets (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,       -- cover | photo
  filename    TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id          TEXT PRIMARY KEY,
  project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,       -- analyze | make_fixture | render | ...
  worker      TEXT NOT NULL,       -- python | node
  status      TEXT NOT NULL DEFAULT 'queued', -- queued | running | done | error | cancelled
  progress    REAL NOT NULL DEFAULT 0,        -- 0..1
  message     TEXT NOT NULL DEFAULT '',
  params      TEXT NOT NULL DEFAULT '{}',     -- JSON
  result      TEXT,                           -- JSON
  error       TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  started_at  TEXT,
  finished_at TEXT,
  heartbeat_at TEXT
);
CREATE INDEX IF NOT EXISTS jobs_queue ON jobs(worker, status, created_at);
CREATE INDEX IF NOT EXISTS jobs_project ON jobs(project_id, created_at);

-- Key/value settings. API keys live here (data/ is git-ignored) and are never logged.
CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

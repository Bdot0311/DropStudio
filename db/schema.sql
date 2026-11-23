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

-- Phase 3: AI storyboard shots (one keyframe image + one clip each).
CREATE TABLE IF NOT EXISTS shots (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  idx           INTEGER NOT NULL,
  section_index INTEGER NOT NULL,
  section_type  TEXT NOT NULL,
  prompt        TEXT NOT NULL,
  seed          INTEGER NOT NULL,
  clip_seed     INTEGER NOT NULL DEFAULT 0,
  -- draft | keyframe_queued | keyframe_running | keyframe_ready | approved | rejected
  -- | clip_queued | clip_running | clip_ready | error
  status        TEXT NOT NULL DEFAULT 'draft',
  keyframe      TEXT,             -- path inside data/ ("cache/<hash>.png")
  clip          TEXT,             -- "cache/<hash>.mp4"
  clip_duration REAL,
  error         TEXT,
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS shots_project ON shots(project_id, idx);

-- Every paid call, so spend is auditable and nothing is ever billed twice.
CREATE TABLE IF NOT EXISTS spend (
  id          TEXT PRIMARY KEY,
  project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL,
  shot_id     TEXT,
  kind        TEXT NOT NULL,        -- image | video
  provider    TEXT NOT NULL,
  model       TEXT NOT NULL,
  usd         REAL NOT NULL,
  cache_key   TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS spend_project ON spend(project_id);

-- Generated files by request hash (same provider+model+prompt+seed+input → same file, no new charge).
CREATE TABLE IF NOT EXISTS gen_cache (
  key        TEXT PRIMARY KEY,
  file       TEXT NOT NULL,         -- "cache/<key>.png|mp4"
  kind       TEXT NOT NULL,
  provider   TEXT NOT NULL,
  model      TEXT NOT NULL,
  usd        REAL NOT NULL,
  duration   REAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

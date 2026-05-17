-- Postman Lite schema
-- Run against the postlite database: psql -U postgres -d postlite -f schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  password    TEXT NOT NULL,
  created_at  BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_name  TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  members     JSONB NOT NULL DEFAULT '[]',
  created_at  BIGINT NOT NULL,
  updated_at  BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS collections (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT,
  folders      JSONB NOT NULL DEFAULT '[]',
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  "order"      INTEGER,
  created_at   BIGINT NOT NULL,
  updated_at   BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS requests (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  method        TEXT NOT NULL,
  url           TEXT NOT NULL,
  params        JSONB NOT NULL DEFAULT '[]',
  headers       JSONB NOT NULL DEFAULT '[]',
  body          JSONB NOT NULL DEFAULT '{"type":"none","content":""}',
  auth          JSONB NOT NULL DEFAULT '{"type":"none"}',
  collection_id TEXT REFERENCES collections(id) ON DELETE CASCADE,
  folder_id     TEXT,
  "order"       INTEGER,
  created_at    BIGINT NOT NULL,
  updated_at    BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS socket_configs (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  url             TEXT NOT NULL,
  protocol        TEXT NOT NULL,
  params          JSONB NOT NULL DEFAULT '[]',
  headers         JSONB NOT NULL DEFAULT '[]',
  auth            JSONB NOT NULL DEFAULT '{"type":"none"}',
  events          JSONB NOT NULL DEFAULT '[]',
  message_type    TEXT NOT NULL DEFAULT 'text',
  message_event   TEXT NOT NULL DEFAULT 'message',
  message_content TEXT NOT NULL DEFAULT '',
  collection_id   TEXT REFERENCES collections(id) ON DELETE CASCADE,
  folder_id       TEXT,
  "order"         INTEGER,
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS sequences (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  workspace_id  TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  collection_id TEXT REFERENCES collections(id) ON DELETE CASCADE,
  steps         JSONB NOT NULL DEFAULT '[]',
  created_at    BIGINT NOT NULL,
  updated_at    BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS history (
  id           TEXT PRIMARY KEY,
  request      JSONB NOT NULL,
  response     JSONB,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  timestamp    BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS history_workspace_timestamp ON history (workspace_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS environments (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  variables    JSONB NOT NULL DEFAULT '[]',
  is_active    BOOLEAN NOT NULL DEFAULT FALSE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  created_at   BIGINT NOT NULL,
  updated_at   BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_states (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  state        JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_invites (
  id             TEXT PRIMARY KEY,
  workspace_id   TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  workspace_name TEXT NOT NULL,
  owner_email    TEXT NOT NULL,
  owner_name     TEXT NOT NULL,
  invitee_email  TEXT NOT NULL,
  permission     TEXT NOT NULL,
  created_at     BIGINT NOT NULL,
  UNIQUE (workspace_id, invitee_email)
);

CREATE INDEX IF NOT EXISTS invites_invitee_email ON workspace_invites (invitee_email);

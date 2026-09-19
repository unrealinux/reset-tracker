export const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS providers (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  vendor        TEXT NOT NULL,
  blurb         TEXT NOT NULL DEFAULT '',
  accent        TEXT NOT NULL DEFAULT 'neutral',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  sources       TEXT NOT NULL DEFAULT '[]',
  usage_url     TEXT NOT NULL DEFAULT '',
  usage_label   TEXT NOT NULL DEFAULT '',
  docs_url      TEXT NOT NULL DEFAULT '',
  status_url    TEXT NOT NULL DEFAULT '',
  enabled       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS resets (
  id                TEXT PRIMARY KEY,
  provider          TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  reset_type        TEXT NOT NULL CHECK (reset_type IN ('regular','banked')),
  announced_at      TEXT NOT NULL,
  applies_to        TEXT,
  applies_to_detail TEXT,
  reason            TEXT,
  reason_detail     TEXT,
  text              TEXT NOT NULL DEFAULT '',
  source_type       TEXT NOT NULL DEFAULT 'observed',
  source_author     TEXT,
  source_url        TEXT,
  follow_ups        TEXT NOT NULL DEFAULT '[]',
  status            TEXT NOT NULL DEFAULT 'confirmed',
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_resets_provider_time ON resets(provider, announced_at DESC);
CREATE INDEX IF NOT EXISTS idx_resets_time ON resets(announced_at DESC);
CREATE INDEX IF NOT EXISTS idx_resets_type ON resets(reset_type);

CREATE TABLE IF NOT EXISTS watches (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  provider             TEXT NOT NULL,
  level                TEXT NOT NULL DEFAULT 'elevated',
  reset_chance_percent INTEGER,
  forecast_window      TEXT NOT NULL DEFAULT '',
  observed_at          TEXT NOT NULL,
  expires_at           TEXT NOT NULL,
  text                 TEXT NOT NULL DEFAULT '',
  source_url           TEXT,
  source_author        TEXT
);
CREATE INDEX IF NOT EXISTS idx_watches_provider ON watches(provider, observed_at DESC);

CREATE TABLE IF NOT EXISTS scheduled_resets (
  id            TEXT PRIMARY KEY,
  provider      TEXT NOT NULL,
  reset_type    TEXT NOT NULL DEFAULT 'regular',
  announced_at  TEXT NOT NULL,
  scheduled_for TEXT,
  text          TEXT NOT NULL DEFAULT '',
  source_url    TEXT,
  source_author TEXT,
  active        INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS subscribers (
  id               TEXT PRIMARY KEY,
  channel          TEXT NOT NULL CHECK (channel IN ('push','telegram','slack','discord','email')),
  provider         TEXT NOT NULL DEFAULT 'all',
  target           TEXT,
  label            TEXT,
  secret           TEXT,
  verified         INTEGER NOT NULL DEFAULT 0,
  active           INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  last_notified_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_subscribers_channel ON subscribers(channel, active);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint   TEXT PRIMARY KEY,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  providers  TEXT NOT NULL DEFAULT 'all',
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  active     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS deliveries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_id TEXT NOT NULL,
  reset_id      TEXT NOT NULL,
  channel       TEXT NOT NULL,
  status        TEXT NOT NULL,
  detail        TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (subscriber_id, reset_id)
);

CREATE TABLE IF NOT EXISTS polls (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source      TEXT NOT NULL,
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  inserted    INTEGER NOT NULL DEFAULT 0,
  updated     INTEGER NOT NULL DEFAULT 0,
  skipped     INTEGER NOT NULL DEFAULT 0,
  error       TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  at     TEXT NOT NULL DEFAULT (datetime('now')),
  actor  TEXT NOT NULL DEFAULT 'system',
  action TEXT NOT NULL,
  detail TEXT
);
`;

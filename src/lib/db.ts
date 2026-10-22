import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config";
import { PROVIDERS } from "./providers";
import {
  inferAppliesTo,
  inferReason,
  inferReasonDetail,
  normalizeProvider,
  normalizeSourceType,
} from "./classify";
import type { StatementSync } from "node:sqlite";
import type { ResetRecord, ResetType } from "./types";
import { SCHEMA } from "./schema";
import { seed } from "../data/seed";

type GlobalWithDb = typeof globalThis & {
  __resetTrackerDb?: DatabaseSync;
  __resetTrackerSeeded?: boolean;
};
const g = globalThis as GlobalWithDb;

// --- Prepared statement cache --------------------------------------------------

// `db.prepare` compiles SQL on every call. The hot paths re-compile the same
// handful of statements thousands of times per request (every repo read), so
// compiled statements are cached per connection keyed by the SQL text. A
// WeakMap keeps the cache from outliving the connection it belongs to —
// important for scripts that open isolated databases.
const preparedStatements = new WeakMap<DatabaseSync, Map<string, StatementSync>>();

/** `db.prepare` with a per-connection statement cache; same SQL compiles once. */
export function prepared(db: DatabaseSync, sql: string): StatementSync {
  let bySql = preparedStatements.get(db);
  if (!bySql) {
    bySql = new Map();
    preparedStatements.set(db, bySql);
  }
  let stmt = bySql.get(sql);
  if (!stmt) {
    stmt = db.prepare(sql);
    bySql.set(sql, stmt);
  }
  return stmt;
}

// --- Record revision ------------------------------------------------------------

/**
 * Changes every time a reset row is written through this module. The repo layer
 * folds it into its cache version so an in-process write is visible to the next
 * read immediately, even when the database fingerprint below is unchanged (a
 * write quantised to the same second as an earlier one).
 */
let recordRevision = 0;

export function bumpRecordRevision(): void {
  recordRevision += 1;
}

export function currentRecordRevision(): number {
  return recordRevision;
}

function migrate(db: DatabaseSync) {
  db.exec(SCHEMA);
}

function upsertProviders(db: DatabaseSync) {
  const stmt = prepared(
    db,
    `INSERT INTO providers (id, name, vendor, blurb, accent, sort_order, sources,
       usage_url, usage_label, docs_url, status_url, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       vendor = excluded.vendor,
       blurb = excluded.blurb,
       accent = excluded.accent,
       sort_order = excluded.sort_order,
       sources = excluded.sources,
       usage_url = excluded.usage_url,
       usage_label = excluded.usage_label,
       docs_url = excluded.docs_url,
       status_url = excluded.status_url,
       enabled = excluded.enabled`,
  );
  for (const p of PROVIDERS) {
    stmt.run(
      p.id,
      p.name,
      p.vendor,
      p.blurb,
      p.accent,
      p.sortOrder,
      JSON.stringify(p.sources),
      p.usageUrl,
      p.usageLabel,
      p.docsUrl,
      p.statusUrl,
      p.enabled ? 1 : 0,
    );
  }
}

export interface SeedRow {
  id: string;
  provider: string;
  resetType: string;
  announcedAt: string;
  appliesTo?: string | null;
  appliesToDetail?: string | null;
  reason?: string | null;
  reasonDetail?: string | null;
  text: string;
  sourceType: string;
  sourceAuthor?: string | null;
  sourceUrl?: string | null;
  followUps?: { at: string | null; url: string | null }[];
  status?: string;
}

/**
 * Rows that are missing a reason/scope from the source table fall back to the
 * same heuristics the live ingestion pipeline uses, so the two paths agree.
 */
export function completeRecord(row: SeedRow): ResetRecord {
  const provider = normalizeProvider(row.provider) ?? "codex";
  const resetType = (row.resetType === "banked" ? "banked" : "regular") as ResetType;
  return {
    id: row.id,
    provider,
    resetType,
    announcedAt: row.announcedAt,
    appliesTo: row.appliesTo ?? inferAppliesTo(row.text, resetType),
    appliesToDetail: row.appliesToDetail ?? null,
    reason: row.reason ?? inferReason(row.text),
    reasonDetail: row.reasonDetail ?? inferReasonDetail(row.text),
    text: row.text ?? "",
    sourceType: normalizeSourceType(row.sourceType),
    sourceAuthor: row.sourceAuthor ?? null,
    sourceUrl: row.sourceUrl ?? null,
    followUps: row.followUps ?? [],
    status: row.status === "pending" ? "pending" : "confirmed",
  };
}

export function insertRecord(db: DatabaseSync, record: ResetRecord): boolean {
  const stmt = prepared(
    db,
    `INSERT INTO resets (id, provider, reset_type, announced_at, applies_to,
       applies_to_detail, reason, reason_detail, text, source_type,
       source_author, source_url, follow_ups, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  );
  const res = stmt.run(
    record.id,
    record.provider,
    record.resetType,
    record.announcedAt,
    record.appliesTo,
    record.appliesToDetail,
    record.reason,
    record.reasonDetail,
    record.text,
    record.sourceType,
    record.sourceAuthor,
    record.sourceUrl,
    JSON.stringify(record.followUps),
    record.status,
  );
  const inserted = Number(res.changes) > 0;
  if (inserted) bumpRecordRevision();
  return inserted;
}

export function updateRecord(db: DatabaseSync, record: ResetRecord): boolean {
  const stmt = prepared(
    db,
    `UPDATE resets SET
       provider = ?, reset_type = ?, announced_at = ?, applies_to = ?,
       applies_to_detail = ?, reason = ?, reason_detail = ?, text = ?,
       source_type = ?, source_author = ?, source_url = ?, follow_ups = ?,
       status = ?, updated_at = datetime('now')
     WHERE id = ?`,
  );
  const res = stmt.run(
    record.provider,
    record.resetType,
    record.announcedAt,
    record.appliesTo,
    record.appliesToDetail,
    record.reason,
    record.reasonDetail,
    record.text,
    record.sourceType,
    record.sourceAuthor,
    record.sourceUrl,
    JSON.stringify(record.followUps),
    record.status,
    record.id,
  );
  const updated = Number(res.changes) > 0;
  if (updated) bumpRecordRevision();
  return updated;
}

export function seedDatabase(db: DatabaseSync, force = false) {
  migrate(db);
  upsertProviders(db);
  const count = prepared(db, "SELECT COUNT(*) AS n FROM resets").get() as { n: number };
  if (count.n > 0 && !force) return { seeded: false, inserted: 0 };

  const rows = seed as unknown as SeedRow[];
  let inserted = 0;
  db.exec("BEGIN");
  try {
    for (const row of rows) {
      if (insertRecord(db, completeRecord(row))) inserted += 1;
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('seeded_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(new Date().toISOString());
  return { seeded: true, inserted };
}

export function getDb(): DatabaseSync {
  if (g.__resetTrackerDb) {
    if (!g.__resetTrackerSeeded) {
      seedDatabase(g.__resetTrackerDb);
      g.__resetTrackerSeeded = true;
    }
    return g.__resetTrackerDb;
  }

  fs.mkdirSync(config.dataDir, { recursive: true });
  const db = new DatabaseSync(config.dbFile);
  migrate(db);
  upsertProviders(db);
  seedDatabase(db);
  g.__resetTrackerDb = db;
  g.__resetTrackerSeeded = true;
  return db;
}

/** Escape hatch for scripts that want an isolated database file. */
export function openDatabase(file: string): DatabaseSync {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  migrate(db);
  upsertProviders(db);
  return db;
}

export function dbFileExists(): boolean {
  return fs.existsSync(config.dbFile);
}

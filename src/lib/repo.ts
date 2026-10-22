import { getDb, prepared, currentRecordRevision } from "./db";
import { PROVIDERS, getProvider } from "./providers";
import { computeStats, forecast, type StatRecord } from "./stats";
import type {
  Provider,
  ProviderId,
  ProviderStatus,
  ResetRecord,
  ResetStats,
  ResetType,
  ScheduledReset,
  Subscriber,
  Watch,
} from "./types";
import type { DatabaseSync } from "node:sqlite";

interface ResetRow {
  id: string;
  provider: string;
  reset_type: string;
  announced_at: string;
  applies_to: string | null;
  applies_to_detail: string | null;
  reason: string | null;
  reason_detail: string | null;
  text: string;
  source_type: string;
  source_author: string | null;
  source_url: string | null;
  follow_ups: string;
  status: string;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function rowToRecord(row: ResetRow): ResetRecord {
  return {
    id: row.id,
    provider: row.provider as ProviderId,
    resetType: (row.reset_type === "banked" ? "banked" : "regular") as ResetType,
    announcedAt: row.announced_at,
    appliesTo: row.applies_to,
    appliesToDetail: row.applies_to_detail,
    reason: row.reason,
    reasonDetail: row.reason_detail,
    text: row.text,
    sourceType: row.source_type as ResetRecord["sourceType"],
    sourceAuthor: row.source_author,
    sourceUrl: row.source_url,
    followUps: parseJson(row.follow_ups, [] as ResetRecord["followUps"]),
    status: row.status === "pending" ? "pending" : "confirmed",
  };
}

export interface ResetQuery {
  provider?: ProviderId | "all";
  type?: ResetType | "all";
  reason?: string;
  from?: string;
  to?: string;
  q?: string;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
  includePending?: boolean;
  /** Keyset pagination: continue strictly after this record. */
  cursorAt?: string;
  cursorId?: string;
}

// --- Data version & read caches ----------------------------------------------

interface CacheEntry<T> {
  version: string;
  value: T;
}

const statRowsCache = new Map<string, CacheEntry<StatRecord[]>>();
const latestCache = new Map<string, CacheEntry<ResetRecord | null>>();
const recordsCache = new Map<string, CacheEntry<ResetRecord[]>>();

/**
 * Fingerprint of the reset table plus this process's write counter.
 *
 * The row-level fingerprint (`COUNT`/`MAX(created_at)`/`MAX(updated_at)`)
 * covers writes that happen outside this module — scripts, another replica in
 * a dev session, the seed step. The in-process write counter (bumped by
 * `insertRecord`/`updateRecord`/`deleteRecord`) catches two writes landing in
 * the same wall-clock second, which the second-resolution timestamps alone
 * cannot distinguish. Keeping the version check to one tiny query means the
 * cache is version-checked, not TTL-guessed: it never serves stale records
 * and it still amortises the heavy multi-hundred-row reads.
 */
export function recordVersion(): string {
  const db = getDb();
  const row = prepared(
    db,
    "SELECT COUNT(*) AS n, MAX(created_at) AS c, MAX(updated_at) AS u FROM resets",
  ).get() as { n: number; c: string | null; u: string | null };
  return `${row.n}:${row.c ?? ""}:${row.u ?? ""}:${currentRecordRevision()}`;
}

function cachedValue<T>(
  store: Map<string, CacheEntry<T>>,
  key: string,
  version: string,
  compute: () => T,
): T {
  const hit = store.get(key);
  if (hit && hit.version === version) return hit.value;
  const value = compute();
  store.set(key, { version, value });
  return value;
}

/** Drop the record-derived caches; used by callers that bulk-write outside repo. */
export function invalidateRecordCaches(): void {
  statRowsCache.clear();
  latestCache.clear();
  recordsCache.clear();
}

/**
 * Reads every confirmed announcement for the statistics, forecast and calendar.
 *
 * Unlike the record readers this has intentionally no LIMIT: the rows come
 * through `iterate()`, so the aggregation always sees the full history. The
 * earlier `allResetsFor` path capped at 500, which would silently truncate the
 * interval series once Codex's history outgrows it. Only the two columns the
 * math needs are selected — no announcement text crosses the wire.
 */
export function statRowsFor(
  provider?: ProviderId | "all",
  includePending = false,
): StatRecord[] {
  const key = `${provider ?? "all"}:${includePending}`;
  return cachedValue(statRowsCache, key, recordVersion(), () => {
    const clauses: string[] = [];
    const params: string[] = [];
    if (provider && provider !== "all") {
      clauses.push("provider = ?");
      params.push(provider);
    }
    if (!includePending) clauses.push("status = 'confirmed'");
    const sql = `SELECT announced_at, reset_type FROM resets ${
      clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
    } ORDER BY announced_at DESC, id DESC`;
    const stmt = prepared(getDb(), sql);
    const out: StatRecord[] = [];
    for (const row of stmt.iterate(...params) as IterableIterator<{
      announced_at: string;
      reset_type: string;
    }>) {
      out.push({
        announcedAt: row.announced_at,
        resetType: row.reset_type === "banked" ? "banked" : "regular",
      });
    }
    return out;
  });
}

function buildWhere(query: ResetQuery) {
  const order = query.order === "asc" ? "ASC" : "DESC";
  const clauses: string[] = [];
  const params: (string | number)[] = [];
  if (query.provider && query.provider !== "all") {
    clauses.push("provider = ?");
    params.push(query.provider);
  }
  if (query.type && query.type !== "all") {
    clauses.push("reset_type = ?");
    params.push(query.type);
  }
  if (query.reason && query.reason !== "all") {
    clauses.push("reason = ?");
    params.push(query.reason);
  }
  if (query.from) {
    clauses.push("announced_at >= ?");
    params.push(new Date(query.from).toISOString());
  }
  if (query.to) {
    clauses.push("announced_at <= ?");
    params.push(new Date(query.to).toISOString());
  }
  if (query.q) {
    // Escape LIKE wildcards so a search for "50%" does not match "50x".
    const like = `%${query.q.replace(/[\\%_]/g, "\\$&")}%`;
    clauses.push(
      "(text LIKE ? ESCAPE '\\' OR reason_detail LIKE ? ESCAPE '\\' OR applies_to LIKE ? ESCAPE '\\' OR source_author LIKE ? ESCAPE '\\')",
    );
    params.push(like, like, like, like);
  }
  if (!query.includePending) clauses.push("status = 'confirmed'");
  if (query.cursorAt && query.cursorId) {
    if (order === "ASC") {
      clauses.push("(announced_at > ? OR (announced_at = ? AND id > ?))");
    } else {
      clauses.push("(announced_at < ? OR (announced_at = ? AND id < ?))");
    }
    params.push(query.cursorAt, query.cursorAt, query.cursorId);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

export function listResets(query: ResetQuery = {}): ResetRecord[] {
  const db = getDb();
  const { where, params } = buildWhere(query);
  const order = query.order === "asc" ? "ASC" : "DESC";
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 500);
  const offset = Math.max(query.offset ?? 0, 0);
  const rows = prepared(
    db,
    `SELECT * FROM resets ${where} ORDER BY announced_at ${order}, id ${order} LIMIT ? OFFSET ?`,
  )
    .all(...params, limit, offset) as unknown as ResetRow[];
  return rows.map(rowToRecord);
}

export function countResets(query: ResetQuery = {}): number {
  const db = getDb();
  const { where, params } = buildWhere(query);
  const row = prepared(
    db,
    `SELECT COUNT(*) AS n FROM resets ${where}`,
  ).get(...params) as {
    n: number;
  };
  return row.n;
}

export function allResetsFor(
  provider?: ProviderId | "all",
  includePending = false,
): ResetRecord[] {
  const key = `${provider ?? "all"}:${includePending}`;
  return cachedValue(recordsCache, key, recordVersion(), () => {
    const out: ResetRecord[] = [];
    // Paged past the 500-row single-query limit so a growing history is never
    // silently truncated for the pages that render every record.
    for (let offset = 0; ; offset += 500) {
      const page = listResets({ provider, limit: 500, offset, includePending });
      out.push(...page);
      if (page.length < 500) break;
    }
    return out;
  });
}

export function getReset(id: string): ResetRecord | null {
  const db = getDb();
  const row = prepared(db, "SELECT * FROM resets WHERE id = ?").get(id) as
    | ResetRow
    | undefined;
  return row ? rowToRecord(row) : null;
}

export function reasonsFor(provider?: ProviderId | "all"): { reason: string; count: number }[] {
  const db = getDb();
  const params: string[] = [];
  let where = "WHERE status = 'confirmed' AND reason IS NOT NULL";
  if (provider && provider !== "all") {
    where += " AND provider = ?";
    params.push(provider);
  }
  const rows = prepared(
    db,
    `SELECT reason, COUNT(*) AS count FROM resets ${where} GROUP BY reason ORDER BY count DESC`,
  ).all(...params) as unknown as { reason: string; count: number }[];
  return rows;
}

export function activeWatch(provider: ProviderId, now = new Date()): Watch | null {
  const db = getDb();
  const row = prepared(
    db,
    `SELECT * FROM watches WHERE provider = ? AND expires_at > ? ORDER BY observed_at DESC LIMIT 1`,
  )
    .get(provider, now.toISOString()) as
    | {
        level: string;
        reset_chance_percent: number | null;
        forecast_window: string;
        observed_at: string;
        expires_at: string;
        text: string;
        source_url: string | null;
        source_author: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    level: row.level === "strong" ? "strong" : "elevated",
    resetChancePercent: row.reset_chance_percent,
    forecastWindow: row.forecast_window,
    observedAt: row.observed_at,
    expiresAt: row.expires_at,
    text: row.text,
    sourceUrl: row.source_url,
    sourceAuthor: row.source_author,
  };
}

export function scheduledReset(provider: ProviderId): ScheduledReset | null {
  const db = getDb();
  const row = prepared(
    db,
    "SELECT * FROM scheduled_resets WHERE provider = ? AND active = 1 ORDER BY announced_at DESC LIMIT 1",
  )
    .get(provider) as
    | {
        id: string;
        reset_type: string;
        announced_at: string;
        scheduled_for: string | null;
        text: string;
        source_url: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    resetType: row.reset_type === "banked" ? "banked" : "regular",
    announcedAt: row.announced_at,
    scheduledFor: row.scheduled_for,
    text: row.text,
    sourceUrl: row.source_url,
  };
}

export function statsFor(
  provider?: ProviderId | "all",
  now = new Date(),
): ResetStats {
  return computeStats(statRowsFor(provider), now);
}

export function providerStatus(provider: Provider, now = new Date()): ProviderStatus {
  const version = recordVersion();
  const stats = computeStats(statRowsFor(provider.id), now);
  // Only the newest record needs its full row (the announcement text etc.);
  // everything else is served by the lightweight stats reader.
  const latest = cachedValue(latestCache, provider.id, version, () => {
    const db = getDb();
    const row = prepared(
      db,
      "SELECT * FROM resets WHERE provider = ? AND status = 'confirmed' ORDER BY announced_at DESC, id DESC LIMIT 1",
    ).get(provider.id) as ResetRow | undefined;
    return row ? rowToRecord(row) : null;
  });
  return {
    provider,
    stats,
    forecast: forecast(statRowsFor(provider.id), now),
    latest,
    watch: activeWatch(provider.id, now),
    scheduled: scheduledReset(provider.id),
  };
}

export function allProviderStatuses(now = new Date()): ProviderStatus[] {
  return PROVIDERS.filter((p) => p.enabled).map((p) => providerStatus(p, now));
}

export function providers(): Provider[] {
  return PROVIDERS.filter((p) => p.enabled);
}

export function providerById(id: string): Provider | undefined {
  return getProvider(id);
}

/** Records inserted after a given ISO timestamp, oldest first. */
export function recordsSince(iso: string): ResetRecord[] {
  return listResets({ from: iso, order: "asc", limit: 200 });
}

export function latestRecords(limit = 5): ResetRecord[] {
  return listResets({ limit });
}

// --- Subscribers -------------------------------------------------------------

export function listSubscribers(): Subscriber[] {
  const db = getDb();
  const rows = prepared(db, "SELECT * FROM subscribers ORDER BY created_at DESC").all() as unknown as {
    id: string;
    channel: Subscriber["channel"];
    provider: string;
    target: string | null;
    label: string | null;
    secret: string | null;
    verified: number;
    active: number;
    created_at: string;
    last_notified_at: string | null;
  }[];
  return rows.map((row) => ({
    id: row.id,
    channel: row.channel,
    provider: row.provider,
    target: row.target,
    label: row.label,
    secret: row.secret,
    verified: row.verified === 1,
    active: row.active === 1,
    createdAt: row.created_at,
    lastNotifiedAt: row.last_notified_at,
  }));
}

export function getSubscriber(id: string): Subscriber | null {
  return listSubscribers().find((s) => s.id === id) ?? null;
}

export function insertSubscriber(sub: Subscriber): void {
  const db = getDb();
  prepared(
    db,
    `INSERT INTO subscribers (id, channel, provider, target, label, secret, verified, active, last_notified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       provider = excluded.provider,
       target = excluded.target,
       label = excluded.label,
       verified = excluded.verified,
       active = excluded.active`,
  ).run(
    sub.id,
    sub.channel,
    sub.provider,
    sub.target,
    sub.label,
    sub.secret,
    sub.verified ? 1 : 0,
    sub.active ? 1 : 0,
    sub.lastNotifiedAt,
  );
}

export function setSubscriberActive(id: string, active: boolean): void {
  prepared(getDb(), "UPDATE subscribers SET active = ? WHERE id = ?").run(active ? 1 : 0, id);
}

export function deleteSubscriber(id: string): void {
  prepared(getDb(), "DELETE FROM subscribers WHERE id = ?").run(id);
}

export function subscribersFor(provider: ProviderId, channel?: Subscriber["channel"]): Subscriber[] {
  return listSubscribers().filter(
    (s) =>
      s.active &&
      (s.provider === "all" || s.provider === provider) &&
      (!channel || s.channel === channel),
  );
}

export function alreadyDelivered(subscriberId: string, resetId: string): boolean {
  const db = getDb();
  const row = prepared(
    db,
    "SELECT 1 AS x FROM deliveries WHERE subscriber_id = ? AND reset_id = ?",
  ).get(subscriberId, resetId);
  return Boolean(row);
}

export function recordDelivery(
  subscriberId: string,
  resetId: string,
  channel: string,
  status: string,
  detail?: string,
): void {
  const db = getDb();
  prepared(
    db,
    `INSERT INTO deliveries (subscriber_id, reset_id, channel, status, detail)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(subscriber_id, reset_id) DO UPDATE SET status = excluded.status, detail = excluded.detail`,
  ).run(subscriberId, resetId, channel, status, detail ?? null);
  if (status === "sent") {
    prepared(
      db,
      "UPDATE subscribers SET last_notified_at = datetime('now') WHERE id = ?",
    ).run(subscriberId);
  }
}

export function deliveryStats(): { channel: string; status: string; count: number }[] {
  const db = getDb();
  return prepared(
    db,
    "SELECT channel, status, COUNT(*) AS count FROM deliveries GROUP BY channel, status",
  ).all() as unknown as { channel: string; status: string; count: number }[];
}

// --- Push subscriptions ------------------------------------------------------

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
  providers: string[];
  userAgent: string | null;
  createdAt: string;
}

export function listPushSubscriptions(): PushSubscriptionRecord[] {
  const db = getDb();
  const rows = prepared(db, "SELECT * FROM push_subscriptions WHERE active = 1").all() as unknown as {
    endpoint: string;
    p256dh: string;
    auth: string;
    providers: string;
    user_agent: string | null;
    created_at: string;
  }[];
  return rows.map((r) => ({
    endpoint: r.endpoint,
    p256dh: r.p256dh,
    auth: r.auth,
    providers: parseJson<string[]>(r.providers, ["all"]),
    userAgent: r.user_agent,
    createdAt: r.created_at,
  }));
}

export function savePushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  providers: string[];
  userAgent?: string | null;
}): void {
  prepared(
    getDb(),
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, providers, user_agent, active)
     VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT(endpoint) DO UPDATE SET
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       providers = excluded.providers,
       user_agent = excluded.user_agent,
       active = 1`,
  ).run(
      input.endpoint,
      input.p256dh,
      input.auth,
      JSON.stringify(input.providers),
      input.userAgent ?? null,
    );
}

export function removePushSubscription(endpoint: string): void {
  prepared(getDb(), "UPDATE push_subscriptions SET active = 0 WHERE endpoint = ?").run(endpoint);
}

// --- Ops ---------------------------------------------------------------------

export function startPoll(db: DatabaseSync, source: string): number {
  const res = prepared(db, "INSERT INTO polls (source, started_at) VALUES (?, ?)").run(
    source,
    new Date().toISOString(),
  );
  return Number(res.lastInsertRowid);
}

export function finishPoll(
  db: DatabaseSync,
  id: number,
  result: { inserted: number; updated: number; skipped: number; error?: string },
): void {
  prepared(
    db,
    `UPDATE polls SET finished_at = ?, inserted = ?, updated = ?, skipped = ?, error = ? WHERE id = ?`,
  ).run(
    new Date().toISOString(),
    result.inserted,
    result.updated,
    result.skipped,
    result.error ?? null,
    id,
  );
}

export function lastPoll() {
  const db = getDb();
  return prepared(
    db,
    "SELECT * FROM polls ORDER BY id DESC LIMIT 1",
  ).get() as
    | {
        id: number;
        source: string;
        started_at: string;
        finished_at: string | null;
        inserted: number;
        updated: number;
        skipped: number;
        error: string | null;
      }
    | undefined;
}

export function audit(actor: string, action: string, detail?: string): void {
  prepared(
    getDb(),
    "INSERT INTO audit_log (actor, action, detail) VALUES (?, ?, ?)",
  ).run(actor, action, detail ?? null);
}

export function recentAudit(limit = 25) {
  return prepared(getDb(), "SELECT * FROM audit_log ORDER BY id DESC LIMIT ?").all(
    limit,
  ) as unknown as {
    id: number;
    at: string;
    actor: string;
    action: string;
    detail: string | null;
  }[];
}

export function getSetting(key: string): string | null {
  const row = prepared(getDb(), "SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  prepared(
    getDb(),
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

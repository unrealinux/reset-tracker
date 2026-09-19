import { completeRecord, getDb, insertRecord, updateRecord, type SeedRow } from "./db";
import { isFollowUpPost } from "./classify";
import { dispatchReset, type NotifyResult } from "./notify";
import { finishPoll, getReset, listResets, rowToRecord, startPoll } from "./repo";
import { defaultSources, type RawAnnouncement, type SourceDefinition } from "./sources";
import type { ProviderId, ResetRecord, ResetType } from "./types";

export interface SourceReport {
  source: string;
  inserted: number;
  updated: number;
  skipped: number;
  error?: string;
  newRecords: ResetRecord[];
}

export interface IngestReport {
  startedAt: string;
  finishedAt: string;
  inserted: number;
  updated: number;
  skipped: number;
  /** Follow-up posts folded into the record they belong to. */
  mergedFollowUps: number;
  sources: SourceReport[];
  notifications: { resetId: string; results: NotifyResult[] }[];
}

function toSeedRow(raw: RawAnnouncement): SeedRow {
  return {
    id: raw.id,
    provider: raw.provider,
    resetType: raw.resetType ?? "regular",
    announcedAt: new Date(raw.announcedAt).toISOString(),
    text: raw.text,
    sourceType: raw.sourceType,
    sourceAuthor: raw.sourceAuthor,
    sourceUrl: raw.sourceUrl,
    followUps: raw.followUps ?? [],
    status: "confirmed",
  };
}

function applyType(record: ResetRecord, raw: RawAnnouncement): ResetRecord {
  if (!raw.resetType) return record;
  return { ...record, resetType: raw.resetType as ResetType };
}

/**
 * Persists a batch of announcements. Existing rows are only touched when the
 * announcement text actually changed, which keeps the audit trail quiet.
 */
export function persistAnnouncements(raw: RawAnnouncement[]): {
  inserted: ResetRecord[];
  updated: ResetRecord[];
  skipped: number;
} {
  const db = getDb();
  const inserted: ResetRecord[] = [];
  const updated: ResetRecord[] = [];
  let skipped = 0;

  for (const item of raw) {
    const record = applyType(completeRecord(toSeedRow(item)), item);
    const existing = getReset(record.id);
    if (!existing) {
      if (insertRecord(db, record)) inserted.push(record);
      else skipped += 1;
      continue;
    }
    const changed =
      existing.text !== record.text ||
      existing.resetType !== record.resetType ||
      existing.announcedAt !== record.announcedAt ||
      existing.sourceUrl !== record.sourceUrl ||
      JSON.stringify(existing.followUps) !== JSON.stringify(record.followUps);
    if (changed) {
      updateRecord(db, { ...record, status: existing.status });
      const refreshed = getReset(record.id);
      if (refreshed) updated.push(refreshed);
    } else {
      skipped += 1;
    }
  }
  return { inserted, updated, skipped };
}

export interface IngestOptions {
  sources?: SourceDefinition[];
  notify?: boolean;
  /** Restrict ingestion to these providers. */
  providers?: ProviderId[];
}

export async function runIngestion(options: IngestOptions = {}): Promise<IngestReport> {
  const db = getDb();
  const startedAt = new Date().toISOString();
  const sources = (options.sources ?? defaultSources()).filter(
    (s) => !options.providers || s.providers.some((p) => options.providers!.includes(p)),
  );

  const reports: SourceReport[] = [];
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  const newRecords: ResetRecord[] = [];

  for (const source of sources) {
    const pollId = startPoll(db, source.name);
    try {
      const result = await source.run();
      const relevant = options.providers
        ? result.announcements.filter((a) => options.providers!.includes(a.provider))
        : result.announcements;
      const { inserted, updated, skipped } = persistAnnouncements(relevant);
      finishPoll(db, pollId, {
        inserted: inserted.length,
        updated: updated.length,
        skipped,
        error: result.error,
      });
      totalInserted += inserted.length;
      totalUpdated += updated.length;
      totalSkipped += skipped;
      newRecords.push(...inserted);
      reports.push({
        source: result.source,
        inserted: inserted.length,
        updated: updated.length,
        skipped,
        error: result.error,
        newRecords: inserted,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      finishPoll(db, pollId, { inserted: 0, updated: 0, skipped: 0, error: detail });
      reports.push({
        source: source.name,
        inserted: 0,
        updated: 0,
        skipped: 0,
        error: detail,
        newRecords: [],
      });
    }
  }

  const notifications: IngestReport["notifications"] = [];
  if (options.notify && newRecords.length > 0) {
    for (const record of newRecords.sort((a, b) => +new Date(a.announcedAt) - +new Date(b.announcedAt))) {
      const summary = await dispatchReset(record);
      notifications.push({ resetId: record.id, results: summary.results });
    }
  }

  const mergedFollowUps = mergeFollowUps();

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    inserted: totalInserted,
    updated: totalUpdated,
    skipped: totalSkipped,
    mergedFollowUps,
    sources: reports,
    notifications,
  };
}

export interface ManualRecordInput {
  id?: string;
  provider: ProviderId;
  resetType: ResetType;
  announcedAt: string;
  text: string;
  appliesTo?: string | null;
  appliesToDetail?: string | null;
  reason?: string | null;
  reasonDetail?: string | null;
  sourceUrl?: string | null;
  sourceAuthor?: string | null;
  status?: "confirmed" | "pending";
}

export function upsertManualRecord(input: ManualRecordInput): {
  record: ResetRecord | null;
  created: boolean;
} {
  const db = getDb();
  const id =
    input.id?.trim() ||
    `manual-${input.provider}-${Date.now().toString(36)}`;
  const record = completeRecord({
    id,
    provider: input.provider,
    resetType: input.resetType,
    announcedAt: new Date(input.announcedAt).toISOString(),
    appliesTo: input.appliesTo ?? null,
    appliesToDetail: input.appliesToDetail ?? null,
    reason: input.reason ?? null,
    reasonDetail: input.reasonDetail ?? null,
    text: input.text,
    sourceType: "manual",
    sourceAuthor: input.sourceAuthor ?? null,
    sourceUrl: input.sourceUrl ?? null,
    followUps: [],
    status: input.status ?? "confirmed",
  });

  const existing = getReset(id);
  if (existing) {
    updateRecord(db, record);
    return { record: getReset(id), created: false };
  }
  insertRecord(db, record);
  return { record: getReset(id), created: true };
}

const HOUR_MS_UNUSED = null;
void HOUR_MS_UNUSED;
/**
 * Merges follow-up posts into the record they belong to. Returns the number of
 * records folded away.
 */
export function mergeFollowUps(provider?: ProviderId): number {
  const db = getDb();
  const providers: ProviderId[] = provider
    ? [provider]
    : (db.prepare("SELECT id FROM providers").all() as unknown as { id: ProviderId }[]).map(
        (row) => row.id,
      );

  let merged = 0;
  for (const id of providers) {
    const rows = listResets({ provider: id, limit: 500, order: "asc" });
    for (let i = 1; i < rows.length; i += 1) {
      const previous = rows[i - 1];
      const current = rows[i];
      if (current.sourceType === "manual") continue;
      if (current.followUps.length > 0) continue;
      if (!isFollowUpPost(previous, current)) continue;

      const followUps = [
        ...previous.followUps,
        { at: current.announcedAt, url: current.sourceUrl },
      ];
      updateRecord(db, { ...previous, followUps });
      deleteRecord(current.id);
      merged += 1;
      rows.splice(i, 1);
      i -= 1;
    }
  }
  return merged;
}

export function deleteRecord(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM resets WHERE id = ?").run(id);
  return Number(result.changes) > 0;
}

export function rawRecordToRecord(row: unknown): ResetRecord {
  return rowToRecord(row as never);
}

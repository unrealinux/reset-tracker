import type { Forecast, ResetRecord, ResetStats } from "./types";

const DAY_MS = 86_400_000;

export function dayDiff(a: string | Date, b: string | Date): number {
  return (new Date(a).getTime() - new Date(b).getTime()) / DAY_MS;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Mean with the single smallest and largest sample removed. Reset histories
 * contain genuine outliers (a 68-day gap, a 12-hour gap in the middle of a
 * launch week); trimming one from each end keeps the projection stable without
 * discarding the shape of the series.
 */
export function trimmedMean(values: number[], trim = 1): number | null {
  if (values.length === 0) return null;
  if (values.length <= trim * 2 + 1) return mean(values);
  const sorted = [...values].sort((a, b) => a - b);
  return mean(sorted.slice(trim, sorted.length - trim));
}

/** Population standard deviation. */
export function stddev(values: number[]): number | null {
  const m = mean(values);
  if (m === null) return null;
  const variance = mean(values.map((v) => (v - m) ** 2));
  return variance === null ? null : Math.sqrt(variance);
}

/** Median absolute deviation — a robust spread measure. */
export function mad(values: number[]): number | null {
  const m = median(values);
  if (m === null) return null;
  return median(values.map((v) => Math.abs(v - m)));
}

/**
 * Intervals in days between consecutive resets, oldest → newest.
 * `includeBanked` controls whether reset-card grants break the waiting chain.
 */
export function intervals(
  records: ResetRecord[],
  options: { includeBanked?: boolean; limit?: number } = {},
): number[] {
  const { includeBanked = true, limit } = options;
  const rows = records
    .filter((r) => (includeBanked ? true : r.resetType === "regular"))
    .slice()
    .sort((a, b) => +new Date(a.announcedAt) - +new Date(b.announcedAt));
  const out: number[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    out.push(dayDiff(rows[i].announcedAt, rows[i - 1].announcedAt));
  }
  const sliced = limit ? out.slice(-limit) : out;
  return sliced.filter((v) => v > 0);
}

export function computeStats(records: ResetRecord[], now: Date = new Date()): ResetStats {
  const sorted = [...records].sort(
    (a, b) => +new Date(b.announcedAt) - +new Date(a.announcedAt),
  );
  const all = intervals(records);
  const oldest = sorted.length ? sorted[sorted.length - 1] : null;
  const newest = sorted.length ? sorted[0] : null;
  const sinceLast = newest ? dayDiff(now, newest.announcedAt) : null;
  const days = new Set(sorted.map((r) => r.announcedAt.slice(0, 10)));

  const count = (windowDays: number) =>
    Math.max(0, Math.round(windowDays)) === 0
      ? 0
      : sorted.filter((r) => dayDiff(now, r.announcedAt) <= windowDays).length;

  return {
    total: sorted.length,
    regular: sorted.filter((r) => r.resetType === "regular").length,
    banked: sorted.filter((r) => r.resetType === "banked").length,
    lastResetAt: newest?.announcedAt ?? null,
    firstResetAt: oldest?.announcedAt ?? null,
    daysSinceLast: sinceLast,
    avgIntervalDays: mean(all),
    medianIntervalDays: median(all),
    longestWaitDays: all.length ? Math.max(...all) : null,
    shortestWaitDays: all.length ? Math.min(...all) : null,
    last30d: count(30),
    last90d: count(90),
    activeDays: days.size,
  };
}

/**
 * Projects the next reset from the full interval history.
 *
 * The basis is a trimmed mean of every interval between consecutive resets, so
 * a single outlier (a long quiet stretch, or a burst of activity during a
 * launch week) cannot dominate. Banked reset cards are excluded by default
 * because a card does not restore usage until it is redeemed, so it does not
 * reset the waiting clock.
 *
 * Confidence comes from the coefficient of variation: a series that swings
 * wildly is reported as low confidence even when the mean looks tidy.
 */
export function forecast(
  records: ResetRecord[],
  now: Date = new Date(),
  options: { includeBanked?: boolean } = {},
): Forecast {
  const rows = [...records]
    .filter((r) => (options.includeBanked ? true : r.resetType === "regular"))
    .sort((a, b) => +new Date(a.announcedAt) - +new Date(b.announcedAt));
  if (rows.length < 3) {
    return {
      estimatedAt: null,
      daysRemaining: null,
      confidence: "low",
      basisDays: null,
      spreadDays: null,
    };
  }

  const all = intervals(rows);
  if (all.length < 2) {
    return {
      estimatedAt: null,
      daysRemaining: null,
      confidence: "low",
      basisDays: null,
      spreadDays: null,
    };
  }

  const basis = trimmedMean(all) ?? mean(all) ?? null;
  const spread = mad(all);
  const deviation = stddev(all);
  if (basis === null || basis <= 0) {
    return {
      estimatedAt: null,
      daysRemaining: null,
      confidence: "low",
      basisDays: null,
      spreadDays: spread,
    };
  }

  const last = rows[rows.length - 1];
  const estimatedAt = new Date(+new Date(last.announcedAt) + basis * DAY_MS);

  const cv = deviation === null ? 1 : deviation / (mean(all) ?? basis);
  const confidence: Forecast["confidence"] =
    cv <= 0.35 && all.length >= 8 ? "high" : cv <= 0.65 && all.length >= 5 ? "medium" : "low";

  return {
    estimatedAt: estimatedAt.toISOString(),
    daysRemaining: dayDiff(estimatedAt, now),
    confidence,
    basisDays: basis,
    spreadDays: spread,
  };
}

export interface CalendarDay {
  date: string;
  regular: number;
  banked: number;
  total: number;
  /** Weekend day, used for the lighter grid shading. */
  weekend: boolean;
}

export interface CalendarWeek {
  /** ISO date of the Sunday that starts the week. */
  start: string;
  days: CalendarDay[];
  monthLabel: string | null;
}

/**
 * Builds a GitHub-style contribution grid ending on the week containing `now`.
 */
export function buildCalendar(
  records: ResetRecord[],
  now: Date = new Date(),
  weeks = 26,
): CalendarWeek[] {
  const counts = new Map<string, { regular: number; banked: number }>();
  for (const r of records) {
    const key = r.announcedAt.slice(0, 10);
    const entry = counts.get(key) ?? { regular: 0, banked: 0 };
    if (r.resetType === "banked") entry.banked += 1;
    else entry.regular += 1;
    counts.set(key, entry);
  }

  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const endDow = end.getUTCDay();
  const gridEnd = new Date(+end + (6 - endDow) * DAY_MS);
  const gridStart = new Date(+gridEnd - (weeks * 7 - 1) * DAY_MS);

  const out: CalendarWeek[] = [];
  const monthFmt = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" });
  for (let w = 0; w < weeks; w += 1) {
    const days: CalendarDay[] = [];
    for (let d = 0; d < 7; d += 1) {
      const cursor = new Date(+gridStart + (w * 7 + d) * DAY_MS);
      const date = cursor.toISOString().slice(0, 10);
      const entry = counts.get(date) ?? { regular: 0, banked: 0 };
      days.push({
        date,
        regular: entry.regular,
        banked: entry.banked,
        total: entry.regular + entry.banked,
        weekend: d === 0 || d === 6,
      });
    }
    const first = days[0].date;
    const prev = out.length ? out[out.length - 1].days[0].date : null;
    const label = prev && prev.slice(0, 7) === first.slice(0, 7)
      ? null
      : monthFmt.format(new Date(`${first}T00:00:00Z`));
    out.push({ start: first, days, monthLabel: label });
  }
  return out;
}

export interface TimelineEntry {
  month: string;
  label: string;
  records: ResetRecord[];
}

export function groupByMonth(records: ResetRecord[]): TimelineEntry[] {
  const fmt = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" });
  const map = new Map<string, ResetRecord[]>();
  for (const r of records) {
    const key = r.announcedAt.slice(0, 7);
    const list = map.get(key) ?? [];
    list.push(r);
    map.set(key, list);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([month, list]) => ({
      month,
      label: fmt.format(new Date(`${month}-01T00:00:00Z`)),
      records: list.sort(
        (a, b) => +new Date(b.announcedAt) - +new Date(a.announcedAt),
      ),
    }));
}

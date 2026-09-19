import type { ResetRecord } from "./types";

export const DAY_MS = 86_400_000;

export function parseTimeZone(value: string | null | undefined): string {
  if (!value || value === "UTC" || value === "utc") return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value;
  } catch {
    return "UTC";
  }
}

export function formatDateTime(
  iso: string,
  locale = "en",
  timeZone = "UTC",
): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(iso));
}

export function formatDate(iso: string, locale = "en", timeZone = "UTC"): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone,
  }).format(new Date(iso));
}

export function formatShortDate(iso: string, locale = "en", timeZone = "UTC"): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(d);
  return parts;
}

export function formatClock(iso: string, locale = "en", timeZone = "UTC"): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(new Date(iso));
}

export interface Duration {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
  past: boolean;
}

export function durationBetween(from: Date | string, to: Date | string): Duration {
  const a = +new Date(from);
  const b = +new Date(to);
  const diff = b - a;
  const past = diff < 0;
  const abs = Math.abs(diff);
  return {
    days: Math.floor(abs / DAY_MS),
    hours: Math.floor((abs % DAY_MS) / 3_600_000),
    minutes: Math.floor((abs % 3_600_000) / 60_000),
    seconds: Math.floor((abs % 60_000) / 1000),
    totalMs: abs,
    past,
  };
}

/**
 * Human duration: "4 days", "about 2.4 days", "3 hours 12 minutes".
 * `style: "coarse"` returns the largest unit only.
 */
export function humanDuration(
  duration: Duration,
  style: "coarse" | "exact" = "coarse",
  labels: { day: string; days: string; hour: string; hours: string; minute: string; minutes: string } = {
    day: "day",
    days: "days",
    hour: "hour",
    hours: "hours",
    minute: "minute",
    minutes: "minutes",
  },
): string {
  if (style === "coarse") {
    if (duration.days >= 1) return `${duration.days} ${duration.days === 1 ? labels.day : labels.days}`;
    if (duration.hours >= 1) return `${duration.hours} ${duration.hours === 1 ? labels.hour : labels.hours}`;
    if (duration.minutes >= 1) return `${duration.minutes} ${labels.minutes}`;
    return "less than a minute";
  }
  const parts: string[] = [];
  if (duration.days) parts.push(`${duration.days} ${duration.days === 1 ? labels.day : labels.days}`);
  if (duration.hours) parts.push(`${duration.hours} ${duration.hours === 1 ? labels.hour : labels.hours}`);
  if (!duration.days && duration.minutes)
    parts.push(`${duration.minutes} ${labels.minutes}`);
  return parts.join(" ") || "less than a minute";
}

export function formatDays(days: number | null, digits = 1): string {
  if (days === null || Number.isNaN(days)) return "—";
  if (Math.abs(days) >= 100) return days.toFixed(0);
  return days.toFixed(digits);
}

export function relativeTime(iso: string, now = new Date(), locale = "en"): string {
  const diffMs = +new Date(iso) - +now;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const abs = Math.abs(diffMs);
  if (abs < 60_000) return rtf.format(Math.round(diffMs / 1000), "second");
  if (abs < 3_600_000) return rtf.format(Math.round(diffMs / 60_000), "minute");
  if (abs < DAY_MS) return rtf.format(Math.round(diffMs / 3_600_000), "hour");
  if (abs < 30 * DAY_MS) return rtf.format(Math.round(diffMs / DAY_MS), "day");
  if (abs < 365 * DAY_MS) return rtf.format(Math.round(diffMs / (30 * DAY_MS)), "month");
  return rtf.format(Math.round(diffMs / (365 * DAY_MS)), "year");
}

export function authorLabel(record: ResetRecord): string {
  if (!record.sourceAuthor) return "Official post";
  const known: Record<string, string> = {
    thsottiaux: "Tibo",
    claudedevs: "Claude Developers",
    lydiahallie: "Lydia Hallie",
    grok: "Grok",
    bot: "Grok Bot",
    elonmusk: "Elon Musk",
  };
  return known[record.sourceAuthor.toLowerCase()] ?? record.sourceAuthor;
}

export function resetTypeLabel(type: ResetRecord["resetType"]): string {
  return type === "banked" ? "Reset card" : "Usage reset";
}

export function truncate(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

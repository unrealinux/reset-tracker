import type { ProviderId, ResetType, SourceType } from "./types";

const MODEL_PATTERNS = [
  /\bnew model\b/i,
  /\b(launch|launched|rolling out|rolled out|release|released|shipped|shipping)\b/i,
  /\b(astra|fable|sol|luna|grok \d|gpt-[\d.]+|opus|sonnet|haiku)\b/i,
];

const FIX_PATTERNS = [
  /\b(fix|fixed|fixes|fixing|bug|quality|issue|issues|buggy|degrad|regress|outage|incident|slow|slowdown|error)\b/i,
];

const MILESTONE_PATTERNS = [
  /\b(\d+(?:\.\d+)?\s*(?:m|million|k|thousand)\b|active users|milestone|anniversary|congrat|celebrat|thank you to the)\b/i,
];

const COMPENSATION_PATTERNS = [
  /\b(compensat|make up for|makeup|sorry|apolog|inconvenienc|as a way to make up)\b/i,
];

const WEEKEND_PATTERNS = [/\b(weekend|saturday|sunday|friday)\b/i];

const PAID_PATTERNS = [
  /\bpaid (users|subscribers|subscriptions|plans?)\b/i,
  /\bplus,? pro and business\b/i,
  /\b(paying|subscribers)\b/i,
];

const MAX_PATTERNS = [/\bmax plan\b/i, /\bmax (users|subscribers)\b/i];

/**
 * Best-effort inference of who an announcement applies to. Explicit values
 * harvested from the source table always win over these heuristics.
 */
export function inferAppliesTo(text: string, resetType: ResetType): string {
  const t = text ?? "";
  if (MAX_PATTERNS.some((re) => re.test(t))) return "Max plan users";
  if (PAID_PATTERNS.some((re) => re.test(t))) return "Paid users";
  if (/\ball (chatgpt work and codex|codex and chatgpt work) users\b/i.test(t))
    return "Paid users";
  if (/\b(everyone|all users|all of you|all subscribers)\b/i.test(t))
    return "All users";
  if (/\b(some|subset|affected)\b/i.test(t)) return "Some users";
  return resetType === "banked" ? "Paid users" : "All users";
}

export function inferReason(text: string): string | null {
  const t = text ?? "";
  if (COMPENSATION_PATTERNS.some((re) => re.test(t))) return "Compensation";
  if (FIX_PATTERNS.some((re) => re.test(t))) return "Fix";
  if (MILESTONE_PATTERNS.some((re) => re.test(t))) return "Milestone";
  if (MODEL_PATTERNS.some((re) => re.test(t))) return "New model";
  if (WEEKEND_PATTERNS.some((re) => re.test(t))) return "Weekend";
  return "Unstated";
}

/** First sentence of the announcement, used as a compact reason detail. */
export function inferReasonDetail(text: string): string | null {
  const cleaned = (text ?? "").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const match = cleaned.match(/^(.{20,180}?[.!?])(\s|$)/);
  const detail = (match ? match[1] : cleaned).trim();
  return detail.length > 200 ? `${detail.slice(0, 197)}…` : detail;
}

const BANKED_PATTERNS = [
  /\bbanked reset\b/i,
  /\breset card\b/i,
  /\bbank(?:ed)? a reset\b/i,
  /\bcredit(?:ed)? (?:every|all|you|each).{0,40}\breset\b/i,
  /\bapply the reset\b/i,
  /\bus(?:e|ing) (?:it|the reset) at your own\b/i,
];

export function inferResetType(text: string, announcedAt: string): ResetType {
  const t = text ?? "";
  if (BANKED_PATTERNS.some((re) => re.test(t))) return "banked";
  // "will do the full banked reset today too" also lands here.
  return "regular";
}

export function normalizeSourceType(value: string | null | undefined): SourceType {
  if (value === "x_post" || value === "observed" || value === "manual") return value;
  return "observed";
}

export function normalizeProvider(value: string): ProviderId | null {
  const v = value.trim().toLowerCase();
  if (v === "codex" || v === "claude" || v === "grok") return v;
  return null;
}

const HOUR_MS = 3_600_000;

/**
 * Matches a first-person reset announcement ("we've reset usage limits…").
 * A post that fails this test is a candidate for being a follow-up.
 */
const FIRST_PERSON_RESET =
  /\b(we|i)(?:'ve| have| are| am| will| is| was)?\s+(?:now\s+)?(?:just\s+)?(?:reset|resetting|reseted|added|credited|giving|grant)/i;

export interface PostLike {
  announcedAt: string;
  sourceAuthor: string | null;
  text: string;
}

/**
 * True when `current` is a short restatement that lands shortly after another
 * account announced the same reset, for example "Grok @Bot usage limits reset"
 * following "We've reset usage limits for all Grok Bot users."
 *
 * The reference trackers file these under the original record and count them as
 * one event, so this project does too — both while ingesting and when auditing
 * already stored rows.
 */
export function isFollowUpPost(previous: PostLike, current: PostLike): boolean {
  const gap = +new Date(current.announcedAt) - +new Date(previous.announcedAt);
  if (gap < 0 || gap > 12 * HOUR_MS) return false;
  if (current.sourceAuthor && current.sourceAuthor === previous.sourceAuthor) return false;

  const clean = current.text.replace(/https?:\/\/\S+/g, "").trim();
  if (!clean || clean.length > 90) return false;
  if (FIRST_PERSON_RESET.test(clean)) return false;
  return /\breset\b/i.test(clean);
}

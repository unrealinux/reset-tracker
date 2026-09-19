export type ProviderId = "codex" | "claude" | "grok";
export type ResetType = "regular" | "banked";
export type SourceType = "x_post" | "observed" | "manual";
export type RecordStatus = "confirmed" | "pending";
export type Channel = "push" | "telegram" | "slack" | "discord" | "email";

export interface ProviderSource {
  handle: string;
  label: string;
  url: string;
}

export interface Provider {
  id: ProviderId;
  name: string;
  vendor: string;
  /** Short product blurb used on cards. */
  blurb: string;
  /** Tailwind-ish accent tokens resolved by CSS variables. */
  accent: string;
  sortOrder: number;
  sources: ProviderSource[];
  usageUrl: string;
  usageLabel: string;
  docsUrl: string;
  statusUrl: string;
  enabled: boolean;
}

export interface FollowUp {
  at: string | null;
  url: string | null;
}

export interface ResetRecord {
  id: string;
  provider: ProviderId;
  resetType: ResetType;
  announcedAt: string;
  appliesTo: string | null;
  appliesToDetail: string | null;
  reason: string | null;
  reasonDetail: string | null;
  text: string;
  sourceType: SourceType;
  sourceAuthor: string | null;
  sourceUrl: string | null;
  followUps: FollowUp[];
  status: RecordStatus;
}

export interface ResetStats {
  total: number;
  regular: number;
  banked: number;
  lastResetAt: string | null;
  firstResetAt: string | null;
  daysSinceLast: number | null;
  avgIntervalDays: number | null;
  medianIntervalDays: number | null;
  longestWaitDays: number | null;
  shortestWaitDays: number | null;
  last30d: number;
  last90d: number;
  /** Distinct calendar days that carry at least one event. */
  activeDays: number;
}

export interface Forecast {
  /** Estimated next reset instant, null when there is not enough history. */
  estimatedAt: string | null;
  /** Days remaining until the estimate (negative when overdue). */
  daysRemaining: number | null;
  /** Confidence bucket derived from sample size and variance. */
  confidence: "low" | "medium" | "high";
  /** Interval used for the projection, in days. */
  basisDays: number | null;
  /** Median absolute deviation of recent intervals, in days. */
  spreadDays: number | null;
}

export interface Watch {
  level: "elevated" | "strong";
  resetChancePercent: number | null;
  forecastWindow: string;
  observedAt: string;
  expiresAt: string;
  text: string;
  sourceUrl: string | null;
  sourceAuthor: string | null;
}

export interface ScheduledReset {
  id: string;
  resetType: ResetType;
  announcedAt: string;
  scheduledFor: string | null;
  text: string;
  sourceUrl: string | null;
}

export interface ProviderStatus {
  provider: Provider;
  stats: ResetStats;
  forecast: Forecast;
  latest: ResetRecord | null;
  watch: Watch | null;
  scheduled: ScheduledReset | null;
}

export interface Subscriber {
  id: string;
  channel: Channel;
  provider: string;
  target: string | null;
  secret: string | null;
  verified: boolean;
  active: boolean;
  createdAt: string;
  lastNotifiedAt: string | null;
  label: string | null;
}

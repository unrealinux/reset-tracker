import { config } from "./config";
import { isFollowUpPost } from "./classify";
import type { ProviderId } from "./types";

export interface RawAnnouncement {
  id: string;
  provider: ProviderId;
  announcedAt: string;
  text: string;
  sourceUrl: string | null;
  sourceAuthor: string | null;
  sourceType: "x_post" | "observed" | "manual";
  resetType?: "regular" | "banked" | null;
  followsUrl?: string | null;
  /** Later posts that belong to this announcement rather than standing alone. */
  followUps?: { at: string | null; url: string | null }[];
}

export interface SourceResult {
  source: string;
  announcements: RawAnnouncement[];
  error?: string;
}

const RESET_PATTERNS = [
  /\b(banked reset|reset card|banked a reset)\b/i,
  /\b(reset|resetting|reseted|refreshed)\b[^.!?]{0,60}\b(usage|limits?|rate limits?|allowance|quotas?)\b/i,
  /\b(usage|limits?|rate limits?|allowance|quotas?)\b[^.!?]{0,60}\b(reset|resetting|refreshed|cleared|replenished)\b/i,
];

/** A post only qualifies when it actually talks about a usage-limit reset. */
export function looksLikeReset(text: string): boolean {
  if (!text) return false;
  if (/\b(password|2fa|mfa|email|session|api key)\b/i.test(text) && !/usage limit/i.test(text)) {
    return false;
  }
  return RESET_PATTERNS.some((re) => re.test(text));
}

function normalizeAuthor(value: string | null | undefined): string | null {
  if (!value) return null;
  const handle = value
    .split("·")[0]
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  return handle || null;
}

function stripHtml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .trim();
}

function xIdFromUrl(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/status\/(\d+)/);
  return match ? match[1] : null;
}

interface FeedItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

function parseRss(xml: string): FeedItem[] {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  return items.map((item) => ({
    title: stripHtml((item.match(/<title>([\s\S]*?)<\/title>/) || [])[1] ?? ""),
    link: ((item.match(/<link>([\s\S]*?)<\/link>/) || [])[1] ?? "").trim(),
    pubDate: ((item.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] ?? "").trim(),
    description: stripHtml((item.match(/<description>([\s\S]*?)<\/description>/) || [])[1] ?? ""),
  }));
}

async function fetchWithTimeout(url: string, ms = 15_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "reset-tracker/1.0 (+self-hosted)", Accept: "*/*" },
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pulls the public Codex reset history from the codex-resets.com API.
 * Their API is free to use; attribution is rendered in the site footer.
 */
export async function codexResetsApiSource(limit = 200): Promise<SourceResult> {
  const source = "codex-resets.com/api/v1";
  try {
    const announcements: RawAnnouncement[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < Math.ceil(limit / 100) + 1; page += 1) {
      const url = new URL("https://codex-resets.com/api/v1/resets");
      url.searchParams.set("limit", "100");
      if (cursor) url.searchParams.set("cursor", cursor);
      const response = await fetchWithTimeout(url.toString());
      if (!response.ok) {
        return { source, announcements, error: `HTTP ${response.status}` };
      }
      const payload = (await response.json()) as {
        data: {
          id: string;
          reset_type: "regular" | "banked";
          announced_at: string;
          text: string;
          source: { type: string; author?: string; url?: string };
        }[];
        pagination: { has_more: boolean; next_cursor: string | null };
      };
      for (const row of payload.data) {
        announcements.push({
          id: row.id,
          provider: "codex",
          announcedAt: row.announced_at,
          text: row.text,
          sourceUrl: row.source.url ?? null,
          sourceAuthor: row.source.author ?? "thsottiaux",
          sourceType: row.source.type === "x_post" ? "x_post" : "observed",
          resetType: row.reset_type,
        });
        if (announcements.length >= limit) break;
      }
      if (!payload.pagination.has_more || !payload.pagination.next_cursor) break;
      cursor = payload.pagination.next_cursor;
    }
    return { source, announcements };
  } catch (error) {
    return {
      source,
      announcements: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Reads whenreset.dev's per-provider RSS feed. */
export async function whenResetFeedSource(provider: ProviderId): Promise<SourceResult> {
  const source = `whenreset.dev/api/reset-feed?provider=${provider}`;
  try {
    const response = await fetchWithTimeout(
      `https://whenreset.dev/api/reset-feed?provider=${provider}`,
    );
    if (!response.ok) return { source, announcements: [], error: `HTTP ${response.status}` };
    const items = parseRss(await response.text());
    const candidates: RawAnnouncement[] = [];
    for (const item of items) {
      if (!looksLikeReset(item.description)) continue;
      const id = xIdFromUrl(item.link);
      const published = new Date(item.pubDate);
      if (Number.isNaN(+published)) continue;
      candidates.push({
        id: id ?? `observed-${provider}-${published.toISOString()}`,
        provider,
        announcedAt: published.toISOString(),
        text: item.description,
        sourceUrl: item.link || null,
        sourceAuthor: normalizeAuthor(item.title),
        sourceType: id ? "x_post" : "observed",
      });
    }

    // The reference feed lists follow-up posts as their own items. Fold them
    // into the announcement they belong to, so the stored event count matches
    // the reference tracker while the link is still preserved.
    candidates.sort((a, b) => +new Date(a.announcedAt) - +new Date(b.announcedAt));
    const announcements: RawAnnouncement[] = [];
    for (const candidate of candidates) {
      const previous = announcements[announcements.length - 1];
      if (previous && isFollowUpPost(previous, candidate)) {
        previous.followUps = [
          ...(previous.followUps ?? []),
          { at: candidate.announcedAt, url: candidate.sourceUrl },
        ];
        continue;
      }
      announcements.push(candidate);
    }
    return { source, announcements };
  } catch (error) {
    return {
      source,
      announcements: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Optional direct feed of an announcement account through a Nitter-compatible
 * mirror. Only posts that read like a reset announcement are kept.
 */
export async function accountFeedSource(
  provider: ProviderId,
  handle: string,
): Promise<SourceResult> {
  const source = `nitter/${handle}`;
  if (!config.sources.nitterBaseUrl) {
    return { source, announcements: [], error: "NITTER_BASE_URL is not configured" };
  }
  try {
    const response = await fetchWithTimeout(`${config.sources.nitterBaseUrl}/${handle}/rss`);
    if (!response.ok) return { source, announcements: [], error: `HTTP ${response.status}` };
    const items = parseRss(await response.text());
    const announcements: RawAnnouncement[] = [];
    for (const item of items) {
      const text = item.description || item.title;
      if (!looksLikeReset(text)) continue;
      const id = xIdFromUrl(item.link);
      const published = new Date(item.pubDate);
      if (Number.isNaN(+published)) continue;
      announcements.push({
        id: id ?? `observed-${provider}-${published.toISOString()}`,
        provider,
        announcedAt: published.toISOString(),
        text,
        sourceUrl: item.link || null,
        sourceAuthor: handle.toLowerCase(),
        sourceType: "x_post",
      });
    }
    return { source, announcements };
  } catch (error) {
    return {
      source,
      announcements: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export interface SourceDefinition {
  name: string;
  providers: ProviderId[];
  run: () => Promise<SourceResult>;
}

export function defaultSources(): SourceDefinition[] {
  const sources: SourceDefinition[] = [];
  if (config.sources.codexResetsApi) {
    sources.push({
      name: "codex-resets-api",
      providers: ["codex"],
      run: () => codexResetsApiSource(),
    });
  }
  sources.push(
    {
      name: "whenreset-claude",
      providers: ["claude"],
      run: () => whenResetFeedSource("claude"),
    },
    {
      name: "whenreset-grok",
      providers: ["grok"],
      run: () => whenResetFeedSource("grok"),
    },
  );
  if (config.sources.nitterBaseUrl) {
    sources.push({
      name: "nitter-thsottiaux",
      providers: ["codex"],
      run: () => accountFeedSource("codex", "thsottiaux"),
    });
    sources.push({
      name: "nitter-claudedevs",
      providers: ["claude"],
      run: () => accountFeedSource("claude", "ClaudeDevs"),
    });
  }
  return sources;
}

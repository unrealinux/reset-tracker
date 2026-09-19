import { config } from "./config";
import { getProvider } from "./providers";
import { resetTypeLabel, truncate } from "./format";
import type { ProviderId, ResetRecord } from "./types";

export type FeedFormat = "rss" | "atom" | "json";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function feedTitle(provider: ProviderId | "all"): string {
  if (provider === "all") return "Usage reset announcements";
  return `${getProvider(provider)?.name ?? provider} reset announcements`;
}

function feedDescription(provider: ProviderId | "all"): string {
  if (provider === "all") {
    return "Official usage-limit reset announcements for Codex, Claude and Grok, with links to the original posts.";
  }
  const p = getProvider(provider);
  return `Official ${p?.name ?? provider} usage-limit reset announcements, with links to the original posts.`;
}

function itemTitle(record: ResetRecord): string {
  const author = record.sourceAuthor ? `@${record.sourceAuthor}` : getProvider(record.provider)?.name;
  return `${author} · ${resetTypeLabel(record.resetType)}`;
}

export function buildRss(records: ResetRecord[], provider: ProviderId | "all"): string {
  const self = `${config.siteUrl}/api/feed?provider=${provider}&format=rss`;
  const items = records
    .map(
      (record) => `    <item>
      <title>${escapeXml(itemTitle(record))}</title>
      <link>${escapeXml(record.sourceUrl ?? `${config.siteUrl}/history`)}</link>
      <guid isPermaLink="false">${escapeXml(record.id)}</guid>
      <pubDate>${new Date(record.announcedAt).toUTCString()}</pubDate>
      <category>${escapeXml(record.provider)}</category>
      <category>${escapeXml(record.resetType)}</category>
      <description>${escapeXml(record.text)}</description>
    </item>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(feedTitle(provider))}</title>
    <link>${config.siteUrl}</link>
    <atom:link href="${escapeXml(self)}" rel="self" type="application/rss+xml"/>
    <description>${escapeXml(feedDescription(provider))}</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

export function buildAtom(records: ResetRecord[], provider: ProviderId | "all"): string {
  const self = `${config.siteUrl}/api/feed?provider=${provider}&format=atom`;
  const updated = records[0]?.announcedAt ?? new Date().toISOString();
  const entries = records
    .map(
      (record) => `  <entry>
    <title>${escapeXml(itemTitle(record))}</title>
    <link href="${escapeXml(record.sourceUrl ?? `${config.siteUrl}/history`)}"/>
    <id>urn:reset-tracker:${escapeXml(record.id)}</id>
    <updated>${new Date(record.announcedAt).toISOString()}</updated>
    <category term="${escapeXml(record.provider)}"/>
    <category term="${escapeXml(record.resetType)}"/>
    <summary>${escapeXml(record.text)}</summary>
  </entry>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(feedTitle(provider))}</title>
  <link href="${config.siteUrl}"/>
  <link rel="self" href="${escapeXml(self)}"/>
  <updated>${new Date(updated).toISOString()}</updated>
  <id>urn:reset-tracker:feed:${provider}</id>
  <subtitle>${escapeXml(feedDescription(provider))}</subtitle>
${entries}
</feed>
`;
}

export function buildJsonFeed(records: ResetRecord[], provider: ProviderId | "all") {
  return {
    version: "https://jsonfeed.org/version/1.1",
    title: feedTitle(provider),
    home_page_url: config.siteUrl,
    feed_url: `${config.siteUrl}/api/feed?provider=${provider}&format=json`,
    description: feedDescription(provider),
    items: records.map((record) => ({
      id: record.id,
      url: record.sourceUrl ?? `${config.siteUrl}/history`,
      title: itemTitle(record),
      content_text: record.text,
      summary: truncate(record.text, 200),
      date_published: record.announcedAt,
      tags: [record.provider, record.resetType, record.reason ?? "Unstated"],
      _reset_tracker: {
        provider: record.provider,
        reset_type: record.resetType,
        applies_to: record.appliesTo,
        reason: record.reason,
        source_author: record.sourceAuthor,
      },
    })),
  };
}

const ICAL_ESCAPE = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");

const icalDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function buildIcal(records: ResetRecord[], provider: ProviderId | "all"): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//reset-tracker//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${ICAL_ESCAPE(feedTitle(provider))}`,
    "X-WR-TIMEZONE:UTC",
  ];

  for (const record of records) {
    const name = getProvider(record.provider)?.name ?? record.provider;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${record.id}@reset-tracker`,
      `DTSTAMP:${icalDate(record.announcedAt)}`,
      `DTSTART:${icalDate(record.announcedAt)}`,
      `SUMMARY:${ICAL_ESCAPE(`${name} ${resetTypeLabel(record.resetType)}`)}`,
      `DESCRIPTION:${ICAL_ESCAPE(
        [
          record.text,
          "",
          `Applies to: ${record.appliesTo ?? "—"}`,
          record.reason ? `Reason: ${record.reason}` : "",
          record.sourceUrl ?? "",
        ]
          .filter(Boolean)
          .join("\n"),
      )}`,
      `CATEGORIES:${record.provider.toUpperCase()},${record.resetType.toUpperCase()}`,
      ...(record.sourceUrl ? [`URL:${record.sourceUrl}`] : []),
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

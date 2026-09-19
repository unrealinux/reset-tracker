#!/usr/bin/env node
/**
 * Refreshes src/data/seed.ts from the public reference trackers.
 *
 *   node scripts/harvest.mjs            # fetch fresh inputs, then rebuild the seed
 *   node scripts/harvest.mjs --cached   # reuse the last downloaded inputs
 *
 * Inputs are cached under the OS temp directory so repeated runs are cheap and
 * the script works offline once it has seen the sources.
 *
 * The reference trackers publish richer metadata than the raw feeds do: their
 * tables carry a curated `applies_to` and `reason` for each event. This script
 * joins those tables with the announcement text from the feeds, which is why it
 * exists alongside the live ingestion pipeline in src/lib/sources.ts (that one
 * has to infer the same fields heuristically).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CACHE = path.join(os.tmpdir(), "reset-tracker-harvest");
const OUT = path.join(process.cwd(), "src", "data", "seed.ts");
const cached = process.argv.includes("--cached");

const INPUTS = [
  ["wr_codex.html", "https://whenreset.dev/codex"],
  ["wr_claude.html", "https://whenreset.dev/claude"],
  ["wr_grok.html", "https://whenreset.dev/grok"],
  ["feed_claude.xml", "https://whenreset.dev/api/reset-feed?provider=claude"],
  ["feed_grok.xml", "https://whenreset.dev/api/reset-feed?provider=grok"],
];

fs.mkdirSync(CACHE, { recursive: true });

async function ensure(name, url) {
  const file = path.join(CACHE, name);
  if (cached && fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  const response = await fetch(url, { headers: { "User-Agent": "reset-tracker/1.0" } });
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
  const text = await response.text();
  fs.writeFileSync(file, text);
  return text;
}

/** Paginates the free codex-resets.com API and caches the merged result. */
async function ensureCodex() {
  const file = path.join(CACHE, "codex_all.json");
  if (cached && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));

  const all = [];
  let cursor = null;
  for (let page = 0; page < 20; page += 1) {
    const url = new URL("https://codex-resets.com/api/v1/resets");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetch(url, { headers: { "User-Agent": "reset-tracker/1.0" } });
    if (!response.ok) throw new Error(`codex-resets api → HTTP ${response.status}`);
    const payload = await response.json();
    all.push(...payload.data);
    if (!payload.pagination.has_more || !payload.pagination.next_cursor) break;
    cursor = payload.pagination.next_cursor;
  }
  fs.writeFileSync(file, JSON.stringify(all, null, 1));
  return all;
}

// --- parsing helpers ---------------------------------------------------------

const dec = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));

const strip = (s) => dec(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

const hub = (url) => (url ? (url.match(/status\/(\d+)/) || [])[1] ?? null : null);

/** Normalises a feed title such as "Lydia Hallie ✨ · Usage reset" to a handle. */
const normalizeAuthor = (title) =>
  title.split("·")[0].trim().toLowerCase().replace(/[^a-z0-9_]/g, "") || null;

function parseTable(html, provider) {
  const tbody = html.slice(html.indexOf("<tbody"), html.indexOf("</tbody>"));
  const trRe = /<tr id="event-([a-z]+)-([^"]+?)"([^>]*)>([\s\S]*?)<\/tr>/g;
  const byId = new Map();
  let m;

  while ((m = trRe.exec(tbody))) {
    const id = m[2];
    const cls = m[3].includes('class="row"')
      ? "row"
      : m[3].includes('class="detail"')
        ? "detail"
        : "other";
    const inner = m[4];

    if (cls === "row") {
      const scopeRaw = (inner.match(/<td class="scope">([\s\S]*?)<\/td>/) || [])[1] ?? "";
      const scopeDetail = scopeRaw.match(/<small>([\s\S]*?)<\/small>/);
      const reasonRaw = (inner.match(/<td class="why">([\s\S]*?)<\/td>/) || [])[1] ?? "";
      const tag = reasonRaw.match(/<span class="tag[^"]*"><span>([\s\S]*?)<\/span><\/span>/);

      byId.set(id, {
        id,
        provider,
        appliesTo: strip(scopeRaw.replace(/<small>[\s\S]*?<\/small>/, "")) || null,
        appliesToDetail: scopeDetail ? strip(scopeDetail[1]) : null,
        reason: tag ? strip(tag[1]) : null,
        reasonDetail:
          strip(reasonRaw.replace(/<span class="tag[^"]*">[\s\S]*?<\/span><\/span>/, "")) || null,
        postUrl: (inner.match(/<td class="src"><a[^>]*href="([^"]+)"/) || [])[1] ?? null,
        typeLabel: (inner.match(/<td><span class="pill[^"]*">([\s\S]*?)<\/span><\/td>/) || [])[1],
        followUps: [],
      });
    } else {
      const rec = byId.get(id.replace(/-sources$/, ""));
      if (!rec) continue;
      for (const li of inner.matchAll(/<li>([\s\S]*?)<\/li>/g)) {
        const role = strip(
          (li[1].match(/<span class="role[^"]*"><span>([\s\S]*?)<\/span>/) || [])[1] ?? "",
        );
        const when = strip((li[1].match(/<span class="when">([\s\S]*?)<\/span>/) || [])[1] ?? "");
        const url = (li[1].match(/<a href="([^"]+)"/) || [])[1] ?? null;
        const iso = when.match(/^(\d\d)\/(\d\d)\/(\d{4}), (\d\d):(\d\d)$/);
        const at = iso ? `${iso[3]}-${iso[1]}-${iso[2]}T${iso[4]}:${iso[5]}:00.000Z` : null;

        // Rows carrying follow-ups render a <button> instead of an <a>, so the
        // canonical post URL only exists on the "Landed" detail line.
        if (!rec.postUrl && /landed/i.test(role)) rec.postUrl = url;
        if (/follow/i.test(role)) rec.followUps.push({ at, url });
      }
    }
  }
  return [...byId.values()];
}

function parseFeed(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => ({
    title: strip((m[1].match(/<title>([\s\S]*?)<\/title>/) || [])[1] ?? ""),
    link: ((m[1].match(/<link>([\s\S]*?)<\/link>/) || [])[1] ?? "").trim(),
    pubDate: ((m[1].match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] ?? "").trim(),
    description: dec((m[1].match(/<description>([\s\S]*?)<\/description>/) || [])[1] ?? "").trim(),
  }));
}

// --- build -------------------------------------------------------------------

const [codexHtml, claudeHtml, grokHtml, claudeXml, grokXml] = await Promise.all([
  ...INPUTS.map(([name, url]) => ensure(name, url)),
]);
const codexApi = await ensureCodex();

const tableIndex = new Map();
const followUpUrls = new Set();
for (const row of [
  ...parseTable(codexHtml, "codex"),
  ...parseTable(claudeHtml, "claude"),
  ...parseTable(grokHtml, "grok"),
]) {
  if (row.postUrl) tableIndex.set(hub(row.postUrl), row);
  for (const f of row.followUps) if (f.url) followUpUrls.add(f.url);
}

const records = [];

for (const r of codexApi) {
  const meta = tableIndex.get(r.id);
  records.push({
    id: r.id,
    provider: "codex",
    resetType: r.reset_type,
    announcedAt: r.announced_at,
    appliesTo: meta?.appliesTo ?? (r.reset_type === "banked" ? "Paid users" : "All users"),
    appliesToDetail: meta?.appliesToDetail ?? null,
    reason: meta?.reason ?? null,
    reasonDetail: meta?.reasonDetail ?? null,
    text: r.text,
    sourceType: r.source.type,
    sourceAuthor: normalizeAuthor(r.source.author ?? ""),
    sourceUrl: r.source.url,
    followUps: meta?.followUps ?? [],
  });
}

for (const [provider, xml] of [
  ["claude", claudeXml],
  ["grok", grokXml],
]) {
  for (const item of parseFeed(xml)) {
    // A feed entry filed under another record's details is a follow-up post,
    // not a reset of its own.
    if (followUpUrls.has(item.link)) continue;
    const id = hub(item.link);
    const meta = tableIndex.get(id);
    records.push({
      id: id ?? `observed-${provider}-${item.pubDate}`,
      provider,
      resetType: /card|banked/i.test(item.title + " " + (meta?.typeLabel ?? "")) ? "banked" : "regular",
      announcedAt: new Date(item.pubDate).toISOString(),
      appliesTo: meta?.appliesTo ?? "All users",
      appliesToDetail: meta?.appliesToDetail ?? null,
      reason: meta?.reason ?? null,
      reasonDetail: meta?.reasonDetail ?? null,
      text: item.description,
      sourceType: "x_post",
      sourceAuthor: normalizeAuthor(item.title),
      sourceUrl: item.link,
      followUps: meta?.followUps ?? [],
    });
  }
}

const seen = new Map();
for (const record of records) if (!seen.has(record.id)) seen.set(record.id, record);
const sorted = [...seen.values()].sort(
  (a, b) => new Date(b.announcedAt) - new Date(a.announcedAt),
);

const body = sorted.map((r) => `  ${JSON.stringify(r)},`).join("\n");
const file = `// Generated by scripts/harvest.mjs — do not edit by hand.
// Snapshot of the public reference trackers; live ingestion supersedes it.
export const seed = [
${body}
];
`;
fs.writeFileSync(OUT, file);

const byProvider = {};
for (const r of sorted) byProvider[r.provider] = (byProvider[r.provider] ?? 0) + 1;

console.log(`Wrote ${path.relative(process.cwd(), OUT)}`);
console.log(`  records: ${sorted.length}`, byProvider);
console.log(`  with follow-ups: ${sorted.filter((r) => r.followUps.length > 0).length}`);
console.log(`  with curated scope: ${sorted.filter((r) => r.appliesTo).length}`);

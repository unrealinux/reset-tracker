#!/usr/bin/env node
/**
 * Self-test: exercises the pure logic that has no HTTP or vendor dependency.
 * Run with `node scripts/selftest.mjs`. Exits non-zero on the first failure.
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { loadEnv } from "./_env.mjs";

loadEnv();

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}\n    ${error.message}`);
  }
}

console.log("\nclassifier");

const { inferAppliesTo, inferReason, looksLikeReset } = {
  ...(await import("../src/lib/classify.ts")),
  ...(await import("../src/lib/sources.ts")),
};

await test("paid-scope detection", () => {
  assert.equal(
    inferAppliesTo("We reset usage limits for all paid users of Codex and ChatGPT Work.", "regular"),
    "Paid users",
  );
});

await test("max-plan scope wins over paid", () => {
  assert.equal(
    inferAppliesTo("We've reset weekly limits for everyone on a Claude Max plan.", "regular"),
    "Max plan users",
  );
});

await test("banked defaults to paid", () => {
  assert.equal(inferAppliesTo("A reset lands soon.", "banked"), "Paid users");
});

await test("reason inference", () => {
  assert.equal(inferReason("This fixes the quality regression."), "Fix");
  assert.equal(inferReason("To celebrate 25M active users we reset limits."), "Milestone");
  assert.equal(inferReason("With Fable 5.1 out today, we've reset limits."), "New model");
  assert.equal(inferReason("Hello."), "Unstated");
});

await test("reset detection rejects unrelated posts", () => {
  assert.equal(looksLikeReset("We've reset usage limits for all users."), true);
  assert.equal(looksLikeReset("Here is a reset link for your password."), false);
  assert.equal(looksLikeReset("Good morning everyone."), false);
});

console.log("\nstats");

const { computeStats, forecast, intervals, buildCalendar } = await import("../src/lib/stats.ts");

const sample = [
  { id: "a", provider: "codex", resetType: "regular", announcedAt: "2026-01-01T00:00:00.000Z" },
  { id: "b", provider: "codex", resetType: "regular", announcedAt: "2026-01-08T00:00:00.000Z" },
  { id: "c", provider: "codex", resetType: "banked", announcedAt: "2026-01-15T00:00:00.000Z" },
];

// Four evenly spaced usage resets: the shape a forecast should handle well.
const regularSample = ["01-01", "01-08", "01-15", "01-22"].map((day, index) => ({
  id: `r${index}`,
  provider: "codex",
  resetType: "regular",
  announcedAt: `2026-${day}T00:00:00.000Z`,
}));

await test("intervals are computed in days", () => {
  assert.deepEqual(intervals(sample).map((n) => Math.round(n)), [7, 7]);
});

await test("stats cover both kinds", () => {
  const stats = computeStats(sample, new Date("2026-01-16T00:00:00.000Z"));
  assert.equal(stats.total, 3);
  assert.equal(stats.regular, 2);
  assert.equal(stats.banked, 1);
  assert.equal(Math.round(stats.daysSinceLast), 1);
  assert.equal(Math.round(stats.avgIntervalDays), 7);
  assert.equal(Math.round(stats.longestWaitDays), 7);
});

await test("forecast ignores banked cards when resetting the clock", () => {
  // The banked card on 2026-01-15 does not restore usage until redeemed, so the
  // regular series is 01-01 → 01-08 and there is not enough history to project.
  assert.equal(forecast(sample, new Date("2026-01-16T00:00:00.000Z")).estimatedAt, null);
});

await test("forecast projects from the last regular reset", () => {
  const result = forecast(regularSample, new Date("2026-01-23T00:00:00.000Z"));
  assert.equal(result.basisDays, 7);
  assert.ok(result.estimatedAt.startsWith("2026-01-29"));
  assert.equal(result.confidence, "low"); // only three intervals, all identical
});

await test("forecast can include banked cards on request", () => {
  const withCard = [...regularSample, {
    id: "card",
    provider: "codex",
    resetType: "banked",
    announcedAt: "2026-01-25T00:00:00.000Z",
  }];
  const result = forecast(withCard, new Date("2026-01-26T00:00:00.000Z"), { includeBanked: true });
  // Intervals 7, 7, 7, 3 → the trimmed mean drops 3 and 7, leaving 7 days
  // measured from the banked card on 01-25.
  assert.equal(result.basisDays, 7);
  assert.ok(result.estimatedAt.startsWith("2026-02-01"));
});

await test("a wildly variable history reports low confidence", () => {
  const choppy = [0, 1, 12, 2, 20, 1, 14, 3].map((days, index, list) => ({
    id: `c${index}`,
    provider: "codex",
    resetType: "regular",
    announcedAt: new Date(
      Date.UTC(2026, 0, 1) +
        list.slice(0, index + 1).reduce((sum, value) => sum + value, 0) * 86_400_000,
    ).toISOString(),
  }));
  const result = forecast(choppy, new Date("2026-02-01T00:00:00.000Z"));
  assert.equal(result.confidence, "low");
  assert.ok(result.basisDays > 0);
});

await test("forecast needs at least three records", () => {
  const result = forecast(regularSample.slice(0, 2));
  assert.equal(result.estimatedAt, null);
  assert.equal(result.confidence, "low");
});

await test("calendar ends on the current week", () => {
  const weeks = buildCalendar(sample, new Date("2026-01-16T00:00:00.000Z"), 8);
  assert.equal(weeks.length, 8);
  const days = weeks.flatMap((week) => week.days);
  assert.equal(days.length, 56);
  const marked = days.filter((day) => day.total > 0);
  assert.equal(marked.length, 3);
  assert.equal(marked.find((d) => d.date === "2026-01-15").banked, 1);
});

console.log("\nauth");

const { createSessionToken, verifySessionToken, checkPassword } = await import(
  "../src/lib/session.ts"
);

await test("valid session verifies", () => {
  assert.equal(verifySessionToken(createSessionToken()), true);
});

await test("tampered session is rejected", () => {
  const token = createSessionToken();
  assert.equal(verifySessionToken(`${token}x`), false);
  assert.equal(verifySessionToken(token.replace(/\.[^.]+$/, ".forged")), false);
  assert.equal(verifySessionToken(undefined), false);
});

await test("expired session is rejected", () => {
  assert.equal(verifySessionToken(createSessionToken(Date.now() - 86_400_000)), false);
});

await test("password comparison", () => {
  assert.equal(checkPassword(process.env.ADMIN_PASSWORD ?? "admin"), true);
  assert.equal(checkPassword("definitely-not-it"), false);
});

console.log("\nfeeds");

const { buildRss, buildAtom, buildJsonFeed, buildIcal } = await import("../src/lib/feeds.ts");

const fullRecord = {
  id: "1234567890",
  provider: "codex",
  resetType: "banked",
  announcedAt: "2026-09-05T00:39:25.000Z",
  appliesTo: "Paid users",
  appliesToDetail: null,
  reason: "New model",
  reasonDetail: "Astra rolled out early",
  text: "We will do the full banked reset today for all Plus, Pro and Business users.",
  sourceType: "x_post",
  sourceAuthor: "thsottiaux",
  sourceUrl: "https://x.com/thsottiaux/status/1234567890",
  followUps: [],
  status: "confirmed",
};

await test("rss is well formed and escapes entities", () => {
  const rss = buildRss([fullRecord], "codex");
  assert.ok(rss.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(rss.includes("<title>Codex reset announcements</title>"));
  assert.ok(rss.includes("&amp;") || !rss.includes("& ")); // no raw ampersands
  assert.ok(rss.includes("https://x.com/thsottiaux/status/1234567890"));
  assert.equal((rss.match(/<item>/g) ?? []).length, 1);
});

await test("atom includes a self link", () => {
  const atom = buildAtom([fullRecord], "all");
  assert.ok(atom.includes('rel="self"'));
  assert.ok(atom.includes("<entry>"));
});

await test("json feed follows the 1.1 shape", () => {
  const feed = buildJsonFeed([fullRecord], "all");
  assert.equal(feed.version, "https://jsonfeed.org/version/1.1");
  assert.equal(feed.items.length, 1);
  assert.equal(feed.items[0]._reset_tracker.reset_type, "banked");
});

await test("ical is a valid VCALENDAR with CRLF", () => {
  const ics = buildIcal([fullRecord], "codex");
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.trimEnd().endsWith("END:VCALENDAR"));
  assert.ok(ics.includes("BEGIN:VEVENT"));
  assert.ok(ics.includes("DTSTART:20260905T003925Z"));
});

console.log("\ni18n");

const { LOCALES, getDictionary, createTranslator, resolveLocale, localizedPath, stripLocale } =
  await import("../src/lib/i18n.ts");

await test("every locale resolves case-insensitively", () => {
  assert.equal(resolveLocale("zh-cn"), "zh-CN");
  assert.equal(resolveLocale("ZH-TW"), "zh-TW");
  assert.equal(resolveLocale("nope"), "en");
  assert.equal(resolveLocale(undefined), "en");
});

await test("translations fall back to English per key", () => {
  const dict = getDictionary("ja");
  assert.equal(dict["nav.home"], "ホーム");
  // A key missing from a translation still resolves to the English string.
  assert.equal(typeof dict["site.description"], "string");
  assert.ok(dict["site.description"].length > 0);
});

await test("placeholder substitution works", () => {
  const t = createTranslator("en");
  assert.equal(t("table.showAll", { n: 53 }), "Show all 53 resets");
  assert.ok(t("remind.push.enabled", { providers: "Codex" }).includes("Codex"));
});

await test("no locale has keys that English lacks", () => {
  const english = Object.keys(getDictionary("en")).sort();
  for (const locale of LOCALES) {
    const extra = Object.keys(getDictionary(locale.code)).filter((key) => !english.includes(key));
    assert.deepEqual(extra, [], `${locale.code} has unknown keys: ${extra.join(", ")}`);
  }
});

await test("all values are non-empty strings", () => {
  for (const locale of LOCALES) {
    for (const [key, value] of Object.entries(getDictionary(locale.code))) {
      assert.equal(typeof value, "string", `${locale.code}.${key}`);
      assert.ok(value.length > 0, `${locale.code}.${key} is empty`);
    }
  }
});

await test("locale paths round-trip", () => {
  assert.equal(localizedPath("/codex", "en"), "/codex");
  assert.equal(localizedPath("/codex", "ja"), "/ja/codex");
  assert.equal(localizedPath("/", "zh-CN"), "/zh-CN");
  assert.deepEqual(stripLocale("/zh-CN/wiki/cache"), { locale: "zh-CN", path: "/wiki/cache" });
  assert.deepEqual(stripLocale("/codex"), { locale: null, path: "/codex" });
});

console.log("\nweb push (RFC 8291)");

const { generateVapidKeys, encryptPayload, vapidJwt } = await import("../src/lib/webpush.ts");

await test("vapid keypair has the expected shape", () => {
  const keys = generateVapidKeys();
  assert.equal(Buffer.from(keys.publicKey, "base64url").length, 65);
  assert.equal(Buffer.from(keys.privateKey, "base64url").length, 32);
});

await test("vapid jwt is a signed ES256 token", () => {
  const keys = generateVapidKeys();
  const jwt = vapidJwt(keys, { audience: "https://push.example.com", subject: "mailto:a@b.c" });
  const [header, payload, signature] = jwt.split(".");
  assert.equal(JSON.parse(Buffer.from(header, "base64url")).alg, "ES256");
  assert.equal(JSON.parse(Buffer.from(payload, "base64url")).aud, "https://push.example.com");
  assert.equal(Buffer.from(signature, "base64url").length, 64);
});

await test("payload uses the aes128gcm frame layout", () => {
  const receiver = crypto.createECDH("prime256v1");
  receiver.generateKeys();
  const auth = crypto.randomBytes(16);
  const body = encryptPayload(
    { p256dh: receiver.getPublicKey().toString("base64url"), auth: auth.toString("base64url") },
    JSON.stringify({ title: "Test" }),
  );
  // salt(16) + rs(4) + idlen(1) + keyid(65) + ciphertext(+16 tag)
  assert.equal(body.readUInt8(20), 65);
  assert.equal(body.readUInt32BE(16), 4096);
  assert.ok(body.length > 21 + 65 + 16);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

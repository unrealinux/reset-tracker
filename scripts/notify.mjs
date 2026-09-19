#!/usr/bin/env node
/**
 * Re-dispatches notifications for recent records. Safe to re-run: a subscriber
 * never receives the same announcement twice.
 *
 *   node scripts/notify.mjs              # last 24 hours
 *   node scripts/notify.mjs --hours 72
 */

import { loadEnv } from "./_env.mjs";

loadEnv();

const args = process.argv.slice(2);
const hoursIndex = args.indexOf("--hours");
const hours = hoursIndex >= 0 ? Number(args[hoursIndex + 1]) || 24 : 24;

const { listResets } = await import("../src/lib/repo.ts");
const { dispatchReset } = await import("../src/lib/notify.ts");

const since = new Date(Date.now() - hours * 3_600_000).toISOString();
const records = listResets({ from: since, order: "asc", limit: 200 });

console.log(`Re-dispatching ${records.length} record(s) from the last ${hours}h`);

for (const record of records) {
  const summary = await dispatchReset(record);
  if (summary.results.length === 0) {
    console.log(`  ${record.id}: no active subscribers`);
    continue;
  }
  for (const result of summary.results) {
    console.log(`  ${record.id} · ${result.channel} → ${result.ok ? "ok" : result.detail}`);
  }
}

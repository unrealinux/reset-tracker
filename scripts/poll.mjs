#!/usr/bin/env node
/**
 * Runs every configured ingestion source.
 *
 *   node scripts/poll.mjs            # ingest + notify
 *   node scripts/poll.mjs --no-notify
 *   node scripts/poll.mjs --provider codex
 *
 * Point a scheduler at `POST /api/cron/poll` instead when the server is running.
 */

import { loadEnv } from "./_env.mjs";

loadEnv();

const args = process.argv.slice(2);
const notify = !args.includes("--no-notify");
const providerIndex = args.indexOf("--provider");
const providers = providerIndex >= 0 ? [args[providerIndex + 1]] : undefined;

const { runIngestion } = await import("../src/lib/ingest.ts");

const report = await runIngestion({ notify, providers });

console.log(`Ingestion finished in ${new Date(report.finishedAt) - new Date(report.startedAt)}ms`);
for (const source of report.sources) {
  console.log(
    `  ${source.source}: +${source.inserted} new, ~${source.updated} updated, ${source.skipped} unchanged${
      source.error ? ` — ERROR ${source.error}` : ""
    }`,
  );
}
console.log(
  `Total: ${report.inserted} new, ${report.updated} updated, ${report.skipped} unchanged, ${report.mergedFollowUps} follow-up(s) merged`,
);

for (const notification of report.notifications) {
  if (notification.results.length === 0) continue;
  console.log(`  notify ${notification.resetId}:`);
  for (const result of notification.results) {
    console.log(`    ${result.channel} ${result.target} → ${result.ok ? "ok" : result.detail}`);
  }
}

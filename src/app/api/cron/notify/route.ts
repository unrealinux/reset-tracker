import crypto from "node:crypto";
import { config } from "@/lib/config";
import { json, problem } from "@/lib/api";
import { dispatchReset } from "@/lib/notify";
import { audit, listResets } from "@/lib/repo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const url = new URL(request.url);
  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    url.searchParams.get("secret") ??
    "";
  const expected = config.cronSecret;
  if (!provided || provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

/**
 * Re-runs delivery for the most recent records. `alreadyDelivered` guarantees a
 * subscriber never receives the same announcement twice, so this is safe to
 * retry after a transient failure.
 */
async function handle(request: Request) {
  if (!authorized(request)) {
    return problem(401, "unauthorized", "A valid cron secret is required.");
  }

  const url = new URL(request.url);
  const hours = Math.min(Math.max(Number(url.searchParams.get("hours") ?? "24") || 24, 1), 720);
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();
  const records = listResets({ from: since, order: "asc", limit: 50 });

  const results = [];
  for (const record of records) {
    const summary = await dispatchReset(record);
    results.push(summary);
  }

  audit("cron", "notify", `${records.length} records re-dispatched`);
  return json({ window_hours: hours, records: records.length, results });
}

export const GET = handle;
export const POST = handle;

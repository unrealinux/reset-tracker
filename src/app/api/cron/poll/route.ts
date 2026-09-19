import crypto from "node:crypto";
import { config } from "@/lib/config";
import { json, problem } from "@/lib/api";
import { runIngestion } from "@/lib/ingest";
import { audit } from "@/lib/repo";

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

async function handle(request: Request) {
  if (!authorized(request)) {
    return problem(401, "unauthorized", "A valid cron secret is required.");
  }

  const url = new URL(request.url);
  const notify = url.searchParams.get("notify") !== "0";
  const report = await runIngestion({ notify });

  audit(
    "cron",
    "poll",
    `${report.inserted} inserted, ${report.updated} updated, ${report.skipped} unchanged`,
  );

  return json(report);
}

export const GET = handle;
export const POST = handle;

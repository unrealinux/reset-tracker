import { json } from "@/lib/api";
import { isProd } from "@/lib/config";
import { PROVIDERS } from "@/lib/providers";
import { lastPoll, statsFor } from "@/lib/repo";

export const dynamic = "force-dynamic";

export function GET() {
  const poll = lastPoll();
  return json({
    status: "ok",
    time: new Date().toISOString(),
    production: isProd,
    providers: PROVIDERS.map((provider) => ({
      id: provider.id,
      records: statsFor(provider.id).total,
    })),
    ingestion: poll
      ? {
          source: poll.source,
          finished_at: poll.finished_at,
          inserted: poll.inserted,
          updated: poll.updated,
          error: poll.error,
        }
      : null,
  });
}

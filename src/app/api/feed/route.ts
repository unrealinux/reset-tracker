import { buildAtom, buildJsonFeed, buildRss, type FeedFormat } from "@/lib/feeds";
import { isProviderId } from "@/lib/providers";
import { listResets } from "@/lib/repo";
import type { ProviderId } from "@/lib/types";

export const dynamic = "force-dynamic";

const CACHE = "public, max-age=300, s-maxage=300, stale-while-revalidate=1800";

export function GET(request: Request) {
  const url = new URL(request.url);
  const providerParam = url.searchParams.get("provider") ?? "all";
  const provider: ProviderId | "all" =
    providerParam !== "all" && isProviderId(providerParam) ? providerParam : "all";

  const formatParam = (url.searchParams.get("format") ?? "rss").toLowerCase();
  const format: FeedFormat =
    formatParam === "json" ? "json" : formatParam === "atom" ? "atom" : "rss";

  const records = listResets({ provider, limit: 100, order: "desc" });

  if (format === "json") {
    return new Response(JSON.stringify(buildJsonFeed(records, provider), null, 2), {
      headers: {
        "Content-Type": "application/feed+json; charset=utf-8",
        "Cache-Control": CACHE,
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  const body = format === "atom" ? buildAtom(records, provider) : buildRss(records, provider);
  return new Response(body, {
    headers: {
      "Content-Type": `${format === "atom" ? "application/atom+xml" : "application/rss+xml"}; charset=utf-8`,
      "Cache-Control": CACHE,
      "Access-Control-Allow-Origin": "*",
    },
  });
}

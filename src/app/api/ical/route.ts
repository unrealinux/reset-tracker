import { buildIcal } from "@/lib/feeds";
import { isProviderId } from "@/lib/providers";
import { listResets } from "@/lib/repo";
import type { ProviderId } from "@/lib/types";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const url = new URL(request.url);
  const providerParam = url.searchParams.get("provider") ?? "all";
  const provider: ProviderId | "all" =
    providerParam !== "all" && isProviderId(providerParam) ? providerParam : "all";

  const records = listResets({ provider, limit: 300, order: "desc" });
  return new Response(buildIcal(records, provider), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="reset-tracker${provider === "all" ? "" : `-${provider}`}.ics"`,
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}

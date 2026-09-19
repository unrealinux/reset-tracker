import { apiMeta } from "@/lib/openapi";
import { json } from "@/lib/api";
import { PROVIDERS } from "@/lib/providers";

export const dynamic = "force-dynamic";

export function GET() {
  return json(
    {
      data: PROVIDERS.map((provider) => ({
        id: provider.id,
        name: provider.name,
        vendor: provider.vendor,
        blurb: provider.blurb,
        sources: provider.sources,
        usage_url: provider.usageUrl,
        docs_url: provider.docsUrl,
        status_url: provider.statusUrl,
      })),
      meta: apiMeta(),
    },
    { maxAge: 3600 },
  );
}

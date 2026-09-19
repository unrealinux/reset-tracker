import { NextResponse } from "next/server";
import { clientId, json, parseLimit, problem, rateLimit, rateLimitHeaders } from "@/lib/api";
import { apiMeta, serializeForecast, serializeRecord, serializeStats } from "@/lib/openapi";
import { PROVIDERS, isProviderId } from "@/lib/providers";
import { providerStatus } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limit = rateLimit(`status:${clientId(request)}`, 240);
  if (!limit.ok) {
    return problem(429, "rate_limited", "Too many requests. Try again shortly.", {
      headers: rateLimitHeaders(limit),
    });
  }

  const url = new URL(request.url);
  const providerParam = url.searchParams.get("provider");
  if (providerParam && !isProviderId(providerParam)) {
    return problem(400, "invalid_parameter", `Unknown provider "${providerParam}".`, {
      parameter: "provider",
    });
  }

  const now = new Date();
  const providers = providerParam
    ? PROVIDERS.filter((p) => p.id === providerParam)
    : PROVIDERS.filter((p) => p.enabled);

  const data = providers.map((provider) => {
    const status = providerStatus(provider, now);
    return {
      provider: {
        id: provider.id,
        name: provider.name,
        vendor: provider.vendor,
        blurb: provider.blurb,
        sources: provider.sources,
        usage_url: provider.usageUrl,
        docs_url: provider.docsUrl,
        status_url: provider.statusUrl,
      },
      latest_reset: status.latest ? serializeRecord(status.latest) : null,
      scheduled_reset: status.scheduled
        ? {
            id: status.scheduled.id,
            reset_type: status.scheduled.resetType,
            announced_at: status.scheduled.announcedAt,
            scheduled_for: status.scheduled.scheduledFor,
            text: status.scheduled.text,
            source_url: status.scheduled.sourceUrl,
          }
        : null,
      active_watch: status.watch
        ? {
            level: status.watch.level,
            reset_chance_percent: status.watch.resetChancePercent,
            forecast_window: status.watch.forecastWindow,
            observed_at: status.watch.observedAt,
            expires_at: status.watch.expiresAt,
            text: status.watch.text,
            source_url: status.watch.sourceUrl,
          }
        : null,
      stats: serializeStats(status.stats),
      forecast: serializeForecast(status.forecast),
    };
  });

  return json({ data, meta: apiMeta() }, { maxAge: 60 });
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
  });
}

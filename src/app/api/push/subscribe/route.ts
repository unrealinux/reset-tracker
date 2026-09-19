import { clientId, json, problem, rateLimit, rateLimitHeaders } from "@/lib/api";
import { isProviderId } from "@/lib/providers";
import { removePushSubscription, savePushSubscription } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limit = rateLimit(`push:${clientId(request)}`, 40, 10 * 60_000);
  if (!limit.ok) {
    return problem(429, "rate_limited", "Too many subscription attempts.", {
      headers: rateLimitHeaders(limit),
    });
  }

  let body: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    providers?: unknown;
    unsubscribe?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return problem(400, "invalid_body", "Expected a JSON object.");
  }

  const endpoint = body.endpoint;
  if (!endpoint || !endpoint.startsWith("https://")) {
    return problem(400, "invalid_endpoint", "A push endpoint is required.", {
      parameter: "endpoint",
    });
  }

  if (body.unsubscribe) {
    removePushSubscription(endpoint);
    return json({ endpoint, active: false });
  }

  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;
  if (!p256dh || !auth) {
    return problem(400, "invalid_keys", "The subscription keys are missing.", {
      parameter: "keys",
    });
  }

  const providers = Array.isArray(body.providers)
    ? body.providers.filter((value): value is string => typeof value === "string" && isProviderId(value))
    : [];
  const normalised = providers.length === 0 ? ["all"] : providers;

  savePushSubscription({
    endpoint,
    p256dh,
    auth,
    providers: normalised,
    userAgent: request.headers.get("user-agent"),
  });

  return json({ endpoint, providers: normalised, active: true }, { status: 201 });
}

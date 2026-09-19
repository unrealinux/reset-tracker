import { NextResponse } from "next/server";
import {
  ApiParamError,
  clientId,
  decodeCursor,
  encodeCursor,
  json,
  parseDateParam,
  parseLimit,
  problem,
  rateLimit,
  rateLimitHeaders,
} from "@/lib/api";
import { apiMeta, serializeRecord } from "@/lib/openapi";
import { isProviderId } from "@/lib/providers";
import { listResets } from "@/lib/repo";
import type { ProviderId, ResetType } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limit = rateLimit(`resets:${clientId(request)}`, 240);
  if (!limit.ok) {
    return problem(429, "rate_limited", "Too many requests. Try again shortly.", {
      headers: rateLimitHeaders(limit),
    });
  }

  const url = new URL(request.url);
  const pageSize = parseLimit(url.searchParams.get("limit"), 20, 100);
  const order = url.searchParams.get("order") === "asc" ? "asc" : "desc";
  const providerParam = url.searchParams.get("provider");
  const typeParam = url.searchParams.get("type");
  const q = url.searchParams.get("q")?.slice(0, 200) ?? undefined;

  if (providerParam && !isProviderId(providerParam)) {
    return problem(400, "invalid_parameter", `Unknown provider "${providerParam}".`, {
      parameter: "provider",
    });
  }
  if (typeParam && typeParam !== "regular" && typeParam !== "banked") {
    return problem(400, "invalid_parameter", 'type must be "regular" or "banked".', {
      parameter: "type",
    });
  }

  let from: string | null;
  let to: string | null;
  try {
    from = parseDateParam(url.searchParams.get("from"), "from");
    to = parseDateParam(url.searchParams.get("to"), "to");
  } catch (error) {
    if (error instanceof ApiParamError) {
      return problem(400, "invalid_parameter", `${error.parameter} ${error.message}.`, {
        parameter: error.parameter,
      });
    }
    throw error;
  }

  const cursorParam = url.searchParams.get("cursor");
  let cursor = null;
  if (cursorParam) {
    cursor = decodeCursor(cursorParam);
    if (!cursor) {
      return problem(400, "invalid_cursor", "The cursor is malformed or expired.", {
        parameter: "cursor",
      });
    }
  }

  const baseQuery = {
    provider: ((providerParam as ProviderId | null) ?? "all") as ProviderId | "all",
    type: ((typeParam as ResetType | null) ?? "all") as ResetType | "all",
    q: q || undefined,
    from: from ?? cursor?.from ?? undefined,
    to: to ?? cursor?.to ?? undefined,
    order: order as "asc" | "desc",
  };

  // Fetch one extra row so we can tell whether another page exists.
  const fetched = listResets({
    ...baseQuery,
    cursorAt: cursor?.announced_at,
    cursorId: cursor?.id,
    limit: Math.min(pageSize + 1, 500),
    offset: 0,
  });

  const hasMore = fetched.length > pageSize;
  const page = hasMore ? fetched.slice(0, pageSize) : fetched;
  const last = page[page.length - 1];

  return json(
    {
      data: page.map(serializeRecord),
      pagination: {
        has_more: hasMore,
        next_cursor:
          hasMore && last
            ? encodeCursor({
                v: 1,
                order,
                announced_at: last.announcedAt,
                id: last.id,
                provider: baseQuery.provider,
                type: baseQuery.type,
                from: baseQuery.from ?? null,
                to: baseQuery.to ?? null,
                q: baseQuery.q ?? null,
              })
            : null,
      },
      meta: apiMeta(),
    },
    { maxAge: 60 },
  );
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

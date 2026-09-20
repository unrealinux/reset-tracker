import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { config } from "./config";

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  request_id: string;
  parameter?: string;
}

/**
 * Every problem `code` this API can return. Kept here so the type URIs below
 * and the error list rendered by /api/docs cannot drift apart.
 */
export const PROBLEM_CODES = [
  "unauthorized",
  "not_found",
  "invalid_parameter",
  "missing_parameter",
  "invalid_body",
  "invalid_channel",
  "invalid_cursor",
  "invalid_endpoint",
  "invalid_keys",
  "missing_target",
  "rate_limited",
] as const;

/**
 * RFC 9457 type URIs. They resolve to this deployment's own API reference and
 * anchor at the matching `code`, so the identifier dereferences to a page that
 * actually exists. It used to point at `reset-tracker.dev`, a domain nobody
 * owns.
 */
const PROBLEM_BASE = `${config.siteUrl}/api/docs#`;

export function requestId(): string {
  return crypto.randomBytes(8).toString("hex");
}

export function problem(
  status: number,
  code: string,
  detail: string,
  options: { parameter?: string; title?: string; headers?: HeadersInit } = {},
): NextResponse<ProblemDetails> {
  const body: ProblemDetails = {
    type: `${PROBLEM_BASE}${code}`,
    title: options.title ?? defaultTitle(status),
    status,
    code,
    detail,
    request_id: requestId(),
    ...(options.parameter ? { parameter: options.parameter } : {}),
  };
  return NextResponse.json(body, {
    status,
    headers: {
      "Content-Type": "application/problem+json",
      "Cache-Control": "no-store",
      ...(options.headers ?? {}),
    },
  });
}

function defaultTitle(status: number): string {
  switch (status) {
    case 400:
      return "Bad Request";
    case 401:
      return "Unauthorized";
    case 403:
      return "Forbidden";
    case 404:
      return "Not Found";
    case 405:
      return "Method Not Allowed";
    case 429:
      return "Too Many Requests";
    default:
      return "Error";
  }
}

export function json<T>(data: T, init: { status?: number; maxAge?: number; headers?: HeadersInit } = {}) {
  const maxAge = init.maxAge ?? 0;
  return NextResponse.json(data, {
    status: init.status ?? 200,
    headers: {
      "Cache-Control":
        maxAge > 0
          ? `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 4}`
          : "no-store",
      "Access-Control-Allow-Origin": "*",
      ...(init.headers ?? {}),
    },
  });
}

// --- Cursor pagination -------------------------------------------------------

export interface CursorPayload {
  v: 1;
  order: "asc" | "desc";
  announced_at: string;
  id: string;
  provider?: string | null;
  type?: string | null;
  from?: string | null;
  to?: string | null;
  q?: string | null;
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function decodeCursor(value: string): CursorPayload | null {
  try {
    const json = Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const parsed = JSON.parse(json) as CursorPayload;
    if (parsed.v !== 1 || !parsed.announced_at || !parsed.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

// --- Rate limiting -----------------------------------------------------------

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

export function rateLimit(
  key: string,
  limit = 120,
  windowMs = 60_000,
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    const fresh = { count: 1, resetAt: now + windowMs };
    buckets.set(key, fresh);
    return { ok: true, limit, remaining: limit - 1, resetAt: fresh.resetAt };
  }
  bucket.count += 1;
  return {
    ok: bucket.count <= limit,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

export function clientId(request: Request): string {
  const headers = request.headers;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "local";
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(Math.max(0, Math.ceil((result.resetAt - Date.now()) / 1000))),
  };
}

export function parseLimit(value: string | null, fallback = 20, max = 100): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), max);
}

export function parseDateParam(value: string | null, parameter: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(+date)) {
    throw new ApiParamError(parameter, "must be an ISO-8601 date-time");
  }
  return date.toISOString();
}

export class ApiParamError extends Error {
  constructor(
    public parameter: string,
    message: string,
  ) {
    super(message);
  }
}

export function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function readBool(value: string | null): boolean {
  return value === "1" || value === "true" || value === "yes";
}

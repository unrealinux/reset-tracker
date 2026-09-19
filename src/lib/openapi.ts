import { config } from "./config";
import { PROVIDERS } from "./providers";

/** OpenAPI 3.1 document for the public read API. */
export function openApiDocument() {
  const providerEnum = PROVIDERS.map((p) => p.id);
  return {
    openapi: "3.1.0",
    info: {
      title: "Reset Tracker Public API",
      version: "1.0.0",
      summary:
        "Official usage-limit reset announcements for Codex, Claude and Grok.",
      description:
        "Free to use, no API key required. In return, please credit this site with a link wherever you display the data.",
      license: { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" },
      contact: { url: `${config.siteUrl}/about` },
    },
    servers: [{ url: config.siteUrl }],
    tags: [
      { name: "status", description: "Current reset status and forecast" },
      { name: "resets", description: "Reset announcement history" },
      { name: "feeds", description: "RSS, JSON and iCal feeds" },
    ],
    paths: {
      "/api/v1/status": {
        get: {
          tags: ["status"],
          summary: "Get the current reset status",
          description:
            "Returns the latest reset, an announced-but-not-yet-observed reset, an active watch, and aggregate statistics. Banked reset cards are reported separately from usage resets.",
          operationId: "getStatus",
          parameters: [
            {
              name: "provider",
              in: "query",
              required: false,
              schema: { type: "string", enum: providerEnum },
              description: "Restrict the response to one provider.",
            },
          ],
          responses: {
            "200": {
              description: "Current status",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/StatusResponse" },
                },
              },
            },
            "400": { $ref: "#/components/responses/Problem" },
            "429": { $ref: "#/components/responses/Problem" },
          },
        },
      },
      "/api/v1/resets": {
        get: {
          tags: ["resets"],
          summary: "List reset announcements",
          description: "Returns reset announcements using cursor-based pagination.",
          operationId: "listResets",
          parameters: [
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
              description: "Number of announcements to return.",
            },
            {
              name: "cursor",
              in: "query",
              schema: {
                type: "string",
                minLength: 1,
                maxLength: 1024,
                pattern: "^[A-Za-z0-9_-]+$",
              },
              description: "Opaque cursor returned by the previous page.",
            },
            {
              name: "provider",
              in: "query",
              schema: { type: "string", enum: providerEnum },
              description: "Restrict to a single provider.",
            },
            {
              name: "type",
              in: "query",
              schema: { type: "string", enum: ["regular", "banked"] },
              description: "Filter by reset kind.",
            },
            {
              name: "from",
              in: "query",
              schema: { type: "string", format: "date-time" },
              description: "Include announcements at or after this timestamp.",
            },
            {
              name: "to",
              in: "query",
              schema: { type: "string", format: "date-time" },
              description: "Include announcements at or before this timestamp.",
            },
            {
              name: "q",
              in: "query",
              schema: { type: "string", maxLength: 200 },
              description: "Full-text search across announcement bodies.",
            },
            {
              name: "order",
              in: "query",
              schema: { type: "string", enum: ["asc", "desc"], default: "desc" },
              description: "Sort by announcement time.",
            },
          ],
          responses: {
            "200": {
              description: "A page of announcements",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ResetListResponse" },
                },
              },
            },
            "400": { $ref: "#/components/responses/Problem" },
            "429": { $ref: "#/components/responses/Problem" },
          },
        },
      },
      "/api/v1/providers": {
        get: {
          tags: ["status"],
          summary: "List tracked providers",
          operationId: "listProviders",
          responses: {
            "200": {
              description: "Tracked providers",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: { type: "array", items: { $ref: "#/components/schemas/Provider" } },
                      meta: { $ref: "#/components/schemas/Meta" },
                    },
                    required: ["data", "meta"],
                  },
                },
              },
            },
          },
        },
      },
      "/api/v1/stats": {
        get: {
          tags: ["status"],
          summary: "Aggregate statistics per provider",
          operationId: "getStats",
          responses: {
            "200": {
              description: "Statistics",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            provider: { type: "string", enum: providerEnum },
                            stats: { $ref: "#/components/schemas/Stats" },
                            forecast: { $ref: "#/components/schemas/Forecast" },
                          },
                          required: ["provider", "stats", "forecast"],
                        },
                      },
                      meta: { $ref: "#/components/schemas/Meta" },
                    },
                    required: ["data", "meta"],
                  },
                },
              },
            },
          },
        },
      },
      "/api/feed": {
        get: {
          tags: ["feeds"],
          summary: "RSS, Atom or JSON Feed of announcements",
          operationId: "getFeed",
          parameters: [
            {
              name: "provider",
              in: "query",
              schema: { type: "string", enum: [...providerEnum, "all"], default: "all" },
            },
            {
              name: "format",
              in: "query",
              schema: {
                type: "string",
                enum: ["rss", "atom", "json"],
                default: "rss",
              },
            },
          ],
          responses: {
            "200": { description: "The requested feed" },
          },
        },
      },
      "/api/ical": {
        get: {
          tags: ["feeds"],
          summary: "iCalendar feed of announcements",
          operationId: "getIcal",
          parameters: [
            {
              name: "provider",
              in: "query",
              schema: { type: "string", enum: [...providerEnum, "all"], default: "all" },
            },
          ],
          responses: { "200": { description: "An iCalendar document" } },
        },
      },
    },
    components: {
      responses: {
        Problem: {
          description: "An error in application/problem+json form",
          content: {
            "application/problem+json": {
              schema: { $ref: "#/components/schemas/Problem" },
            },
          },
        },
      },
      schemas: {
        Meta: {
          type: "object",
          properties: {
            api_version: { type: "string", enum: ["v1"] },
            generated_at: { type: "string", format: "date-time" },
            attribution: { type: "string" },
          },
          required: ["api_version", "generated_at"],
        },
        ProviderSource: {
          type: "object",
          properties: {
            handle: { type: "string" },
            label: { type: "string" },
            url: { type: "string", format: "uri" },
          },
          required: ["handle", "label", "url"],
        },
        Provider: {
          type: "object",
          properties: {
            id: { type: "string", enum: providerEnum },
            name: { type: "string" },
            vendor: { type: "string" },
            blurb: { type: "string" },
            sources: { type: "array", items: { $ref: "#/components/schemas/ProviderSource" } },
            usage_url: { type: "string", format: "uri" },
            docs_url: { type: "string", format: "uri" },
            status_url: { type: "string", format: "uri" },
          },
          required: ["id", "name", "vendor"],
        },
        ResetSource: {
          oneOf: [
            {
              type: "object",
              properties: {
                type: { type: "string", enum: ["x_post"] },
                author: { type: "string" },
                url: { type: "string", format: "uri" },
              },
              required: ["type", "author", "url"],
            },
            {
              type: "object",
              properties: {
                type: { type: "string", enum: ["observed", "manual"] },
                url: { type: ["string", "null"], format: "uri" },
              },
              required: ["type"],
            },
          ],
        },
        Reset: {
          type: "object",
          properties: {
            id: { type: "string", description: "Stable record identifier." },
            provider: { type: "string", enum: providerEnum },
            reset_type: {
              type: "string",
              enum: ["regular", "banked"],
              description:
                "`regular` clears usage immediately; `banked` credits a reset card the user redeems later.",
            },
            announced_at: { type: "string", format: "date-time" },
            applies_to: { type: ["string", "null"] },
            applies_to_detail: { type: ["string", "null"] },
            reason: { type: ["string", "null"] },
            reason_detail: { type: ["string", "null"] },
            text: { type: "string" },
            source: { $ref: "#/components/schemas/ResetSource" },
            follow_ups: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  at: { type: ["string", "null"], format: "date-time" },
                  url: { type: ["string", "null"], format: "uri" },
                },
              },
            },
            status: { type: "string", enum: ["confirmed", "pending"] },
          },
          required: ["id", "provider", "reset_type", "announced_at", "text", "source"],
        },
        Stats: {
          type: "object",
          properties: {
            total: { type: "integer", minimum: 0 },
            regular: { type: "integer", minimum: 0 },
            banked: { type: "integer", minimum: 0 },
            last_reset_at: { type: ["string", "null"], format: "date-time" },
            first_reset_at: { type: ["string", "null"], format: "date-time" },
            days_since_last: { type: ["number", "null"], minimum: 0 },
            avg_interval_days: { type: ["number", "null"], minimum: 0 },
            median_interval_days: { type: ["number", "null"], minimum: 0 },
            longest_wait_days: { type: ["number", "null"], minimum: 0 },
            shortest_wait_days: { type: ["number", "null"], minimum: 0 },
            last_30d: { type: "integer", minimum: 0 },
            last_90d: { type: "integer", minimum: 0 },
            active_days: { type: "integer", minimum: 0 },
          },
          required: ["total", "last_reset_at", "days_since_last", "avg_interval_days"],
        },
        Forecast: {
          type: "object",
          properties: {
            estimated_at: { type: ["string", "null"], format: "date-time" },
            days_remaining: { type: ["number", "null"] },
            confidence: { type: "string", enum: ["low", "medium", "high"] },
            basis_days: { type: ["number", "null"] },
            spread_days: { type: ["number", "null"] },
          },
          required: ["estimated_at", "confidence"],
        },
        Watch: {
          type: "object",
          properties: {
            level: { type: "string", enum: ["elevated", "strong"] },
            reset_chance_percent: { type: ["integer", "null"], minimum: 0, maximum: 100 },
            forecast_window: { type: "string" },
            observed_at: { type: "string", format: "date-time" },
            expires_at: { type: "string", format: "date-time" },
            text: { type: "string" },
            source_url: { type: ["string", "null"], format: "uri" },
          },
          required: ["level", "observed_at", "expires_at"],
        },
        ScheduledReset: {
          type: "object",
          properties: {
            id: { type: "string" },
            reset_type: { type: "string", enum: ["regular", "banked"] },
            announced_at: { type: "string", format: "date-time" },
            scheduled_for: { type: ["string", "null"], format: "date-time" },
            text: { type: "string" },
            source_url: { type: ["string", "null"], format: "uri" },
          },
          required: ["id", "reset_type", "announced_at"],
        },
        ProviderStatus: {
          type: "object",
          properties: {
            provider: { $ref: "#/components/schemas/Provider" },
            latest_reset: {
              anyOf: [{ $ref: "#/components/schemas/Reset" }, { type: "null" }],
            },
            scheduled_reset: {
              anyOf: [{ $ref: "#/components/schemas/ScheduledReset" }, { type: "null" }],
            },
            active_watch: { anyOf: [{ $ref: "#/components/schemas/Watch" }, { type: "null" }] },
            stats: { $ref: "#/components/schemas/Stats" },
            forecast: { $ref: "#/components/schemas/Forecast" },
          },
          required: ["provider", "stats", "forecast"],
        },
        StatusResponse: {
          type: "object",
          properties: {
            data: {
              type: "array",
              items: { $ref: "#/components/schemas/ProviderStatus" },
            },
            meta: { $ref: "#/components/schemas/Meta" },
          },
          required: ["data", "meta"],
        },
        ResetListResponse: {
          type: "object",
          properties: {
            data: { type: "array", items: { $ref: "#/components/schemas/Reset" } },
            pagination: {
              type: "object",
              properties: {
                has_more: { type: "boolean" },
                next_cursor: { type: ["string", "null"] },
              },
              required: ["has_more", "next_cursor"],
            },
            meta: { $ref: "#/components/schemas/Meta" },
          },
          required: ["data", "pagination", "meta"],
        },
        Problem: {
          type: "object",
          properties: {
            type: { type: "string", format: "uri" },
            title: { type: "string" },
            status: { type: "integer" },
            code: { type: "string" },
            detail: { type: "string" },
            request_id: { type: "string" },
            parameter: { type: "string" },
          },
          required: ["type", "title", "status", "code", "detail", "request_id"],
        },
      },
    },
  };
}

export function serializeRecord(record: import("./types").ResetRecord) {
  return {
    id: record.id,
    provider: record.provider,
    reset_type: record.resetType,
    announced_at: record.announcedAt,
    applies_to: record.appliesTo,
    applies_to_detail: record.appliesToDetail,
    reason: record.reason,
    reason_detail: record.reasonDetail,
    text: record.text,
    source:
      record.sourceType === "x_post"
        ? {
            type: "x_post" as const,
            author: record.sourceAuthor ?? "official",
            url: record.sourceUrl ?? "",
          }
        : { type: record.sourceType, url: record.sourceUrl },
    follow_ups: record.followUps,
    status: record.status,
  };
}

export function serializeStats(stats: import("./types").ResetStats) {
  return {
    total: stats.total,
    regular: stats.regular,
    banked: stats.banked,
    last_reset_at: stats.lastResetAt,
    first_reset_at: stats.firstResetAt,
    days_since_last: stats.daysSinceLast,
    avg_interval_days: stats.avgIntervalDays,
    median_interval_days: stats.medianIntervalDays,
    longest_wait_days: stats.longestWaitDays,
    shortest_wait_days: stats.shortestWaitDays,
    last_30d: stats.last30d,
    last_90d: stats.last90d,
    active_days: stats.activeDays,
  };
}

export function serializeForecast(forecast: import("./types").Forecast) {
  return {
    estimated_at: forecast.estimatedAt,
    days_remaining: forecast.daysRemaining,
    confidence: forecast.confidence,
    basis_days: forecast.basisDays,
    spread_days: forecast.spreadDays,
  };
}

export function apiMeta() {
  return {
    api_version: "v1" as const,
    generated_at: new Date().toISOString(),
    attribution: `${config.siteUrl} — please link back when displaying this data.`,
  };
}

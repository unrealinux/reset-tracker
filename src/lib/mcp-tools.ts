import { PROVIDERS, isProviderId } from "./providers";
import { listResets, providerStatus, reasonsFor } from "./repo";
import { serializeForecast, serializeRecord, serializeStats } from "./openapi";
import { buildCalendar } from "./stats";
import type { ProviderId, ResetType } from "./types";

/**
 * Shared Model Context Protocol tool definitions. Used by both the HTTP
 * endpoint (`/api/mcp`) and the stdio server (`mcp/server.mjs`), so the two
 * transports can never drift apart.
 */

export const MCP_PROTOCOL_VERSION = "2025-06-18";

export const MCP_SERVER_INFO = {
  name: "reset-tracker",
  version: "1.0.0",
  title: "Usage reset tracker",
};

export const MCP_INSTRUCTIONS =
  "Official usage-limit reset data for Codex, Claude and Grok. Use get_status for the latest " +
  "reset and the next estimate, list_resets for the history with original post links, and " +
  "explain_reset_type to distinguish an announced reset from a banked reset card.";

const PROVIDER_ENUM = PROVIDERS.map((provider) => provider.id);

export const MCP_TOOLS = [
  {
    name: "get_status",
    title: "Current reset status",
    description:
      "Latest official usage-limit reset for each provider, plus days waiting, the next estimate and any elevated-probability watch.",
    inputSchema: {
      type: "object",
      properties: {
        provider: {
          type: "string",
          enum: PROVIDER_ENUM,
          description: "Restrict the answer to a single provider.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_resets",
    title: "List reset announcements",
    description:
      "Announcement history with the original post link for each record. Use this to answer questions about specific resets.",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string", enum: PROVIDER_ENUM },
        type: {
          type: "string",
          enum: ["regular", "banked"],
          description: "regular = usage cleared now; banked = a reset card to redeem later.",
        },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 10 },
        since: { type: "string", description: "ISO-8601 timestamp lower bound." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_stats",
    title: "Reset statistics",
    description:
      "Average and median interval between resets, longest wait, counts per provider, the distribution of reasons, and the reset calendar for the last 26 weeks.",
    inputSchema: {
      type: "object",
      properties: { provider: { type: "string", enum: PROVIDER_ENUM } },
      additionalProperties: false,
    },
  },
  {
    name: "explain_reset_type",
    title: "Explain reset types",
    description:
      "Explains the difference between an announced usage reset, a banked reset card and a personal usage window, and where a user checks their own countdown.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

export interface McpToolArgs {
  provider?: string;
  type?: string;
  limit?: number;
  since?: string;
}

export interface McpToolResult {
  content: { type: "text"; text: string }[];
  structuredContent: unknown;
}

function resolveProvider(value: string | undefined): ProviderId | "all" {
  return value && isProviderId(value) ? value : "all";
}

function selected(value: string | undefined) {
  const provider = resolveProvider(value);
  return provider === "all" ? PROVIDERS : PROVIDERS.filter((entry) => entry.id === provider);
}

export function callMcpTool(name: string, args: McpToolArgs = {}): McpToolResult {
  const wrap = (payload: unknown): McpToolResult => ({
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  });

  switch (name) {
    case "get_status":
      return wrap({
        generated_at: new Date().toISOString(),
        providers: selected(args.provider).map((provider) => {
          const status = providerStatus(provider);
          return {
            provider: provider.id,
            name: provider.name,
            latest_reset: status.latest ? serializeRecord(status.latest) : null,
            stats: serializeStats(status.stats),
            forecast: serializeForecast(status.forecast),
            active_watch: status.watch,
            check_your_own_countdown: provider.usageUrl,
          };
        }),
      });

    case "list_resets": {
      const limit = Math.min(Math.max(args.limit ?? 10, 1), 100);
      const records = listResets({
        provider: resolveProvider(args.provider),
        type: (args.type as ResetType | undefined) ?? "all",
        from: args.since,
        limit,
        order: "desc",
      });
      return wrap({ count: records.length, resets: records.map(serializeRecord) });
    }

    case "get_stats":
      return wrap({
        providers: selected(args.provider).map((provider) => {
          const status = providerStatus(provider);
          const calendar = buildCalendar(
            listResets({ provider: provider.id, limit: 500 }),
            new Date(),
            26,
          );
          return {
            provider: provider.id,
            stats: serializeStats(status.stats),
            forecast: serializeForecast(status.forecast),
            reasons: reasonsFor(provider.id),
            calendar: calendar
              .flatMap((week) => week.days)
              .filter((day) => day.total > 0)
              .map((day) => ({ date: day.date, regular: day.regular, banked: day.banked })),
          };
        }),
      });

    case "explain_reset_type":
      return wrap({
        usage_reset:
          "An announced, one-off clear of usage limits. It restores allowances for the users named in the announcement, immediately.",
        reset_card:
          "A banked reset credited to an eligible account. It does nothing until the user redeems it, and it is consumed only if it refreshes at least one window.",
        personal_window:
          "The automatic 5-hour and weekly windows that refill on their own schedule. They are personal, are never announced, and are not recorded by this service.",
        where_to_check: Object.fromEntries(PROVIDERS.map((p) => [p.id, p.usageUrl])),
      });

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// --- JSON-RPC 2.0 ------------------------------------------------------------

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | {
      jsonrpc: "2.0";
      id: string | number | null;
      error: { code: number; message: string; data?: unknown };
    };

export const RPC_ERRORS = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
} as const;

function ok(id: JsonRpcRequest["id"], result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function fail(
  id: JsonRpcRequest["id"],
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data ? { data } : {}) } };
}

/** Handles one JSON-RPC message. Returns `null` for notifications. */
export function handleMcpMessage(message: JsonRpcRequest): JsonRpcResponse | null {
  const id = message.id ?? null;

  switch (message.method) {
    case "initialize":
      return ok(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: MCP_SERVER_INFO,
        instructions: MCP_INSTRUCTIONS,
      });

    case "notifications/initialized":
    case "notifications/cancelled":
    case "notifications/roots/list_changed":
      return null;

    case "ping":
      return ok(id, {});

    case "tools/list":
      return ok(id, { tools: MCP_TOOLS });

    case "tools/call": {
      const params = message.params ?? {};
      const name = String(params.name ?? "");
      try {
        return ok(id, callMcpTool(name, (params.arguments ?? {}) as McpToolArgs));
      } catch (error) {
        return fail(id, RPC_ERRORS.invalidParams, error instanceof Error ? error.message : "failed");
      }
    }

    case "resources/list":
      return ok(id, { resources: [] });

    case "resources/templates/list":
      return ok(id, { resourceTemplates: [] });

    case "prompts/list":
      return ok(id, { prompts: [] });

    default:
      return fail(id, RPC_ERRORS.methodNotFound, `Method not found: ${message.method}`);
  }
}

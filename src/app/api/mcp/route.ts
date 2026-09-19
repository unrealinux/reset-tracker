import { NextResponse } from "next/server";
import { clientId, rateLimit } from "@/lib/api";
import {
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_INFO,
  MCP_TOOLS,
  RPC_ERRORS,
  handleMcpMessage,
  type JsonRpcRequest,
} from "@/lib/mcp-tools";

export const dynamic = "force-dynamic";

/**
 * Model Context Protocol endpoint (Streamable HTTP, JSON response mode).
 *
 *   claude mcp add --transport http reset-tracker http://localhost:3000/api/mcp
 */

export async function POST(request: Request) {
  const limit = rateLimit(`mcp:${clientId(request)}`, 120);
  if (!limit.ok) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: RPC_ERRORS.internal, message: "Rate limited" } },
      { status: 429, headers: { "Access-Control-Allow-Origin": "*" } },
    );
  }

  let body: JsonRpcRequest | JsonRpcRequest[];
  try {
    body = (await request.json()) as JsonRpcRequest | JsonRpcRequest[];
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: RPC_ERRORS.parse, message: "Parse error" } },
      { status: 400, headers: { "Access-Control-Allow-Origin": "*" } },
    );
  }

  const batch = Array.isArray(body);
  const messages: JsonRpcRequest[] = Array.isArray(body) ? body : [body];
  const responses = messages
    .map((message) => handleMcpMessage(message))
    .filter((response): response is NonNullable<typeof response> => response !== null);

  if (responses.length === 0) {
    return new NextResponse(null, {
      status: 202,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  return NextResponse.json(batch ? responses : responses[0], {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}

/** A self-describing discovery document for humans and simple clients. */
export async function GET() {
  return NextResponse.json({
    protocolVersion: MCP_PROTOCOL_VERSION,
    serverInfo: MCP_SERVER_INFO,
    transport: "streamable-http",
    tools: MCP_TOOLS.map((tool) => ({ name: tool.name, description: tool.description })),
    usage:
      'POST JSON-RPC 2.0 messages, e.g. {"jsonrpc":"2.0","id":1,"method":"tools/list"}. A stdio server is also shipped: `npm run mcp`.',
  });
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Mcp-Session-Id, MCP-Protocol-Version",
    },
  });
}

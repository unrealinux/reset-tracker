#!/usr/bin/env node
/**
 * Stdio MCP server exposing the same tools as `/api/mcp`.
 *
 *   npm run mcp
 *
 * Claude Desktop / Claude Code configuration:
 *   { "mcpServers": { "reset-tracker": {
 *       "command": "node",
 *       "args": ["/absolute/path/to/mcp/server.mjs"] } } }
 */

import { loadEnv } from "../scripts/_env.mjs";

loadEnv();

const { handleMcpMessage, RPC_ERRORS, MCP_PROTOCOL_VERSION, MCP_SERVER_INFO } = await import(
  "../src/lib/mcp-tools.ts"
);

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function handleLine(line) {
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    send({ jsonrpc: "2.0", id: null, error: { code: RPC_ERRORS.parse, message: "Parse error" } });
    return;
  }

  for (const message of Array.isArray(parsed) ? parsed : [parsed]) {
    const response = handleMcpMessage(message);
    if (response) send(response);
  }
}

if (process.argv.includes("--describe")) {
  // Handy for smoke tests: print the server metadata and exit.
  send({ protocolVersion: MCP_PROTOCOL_VERSION, serverInfo: MCP_SERVER_INFO });
  process.exit(0);
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let index = buffer.indexOf("\n");
  while (index >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    index = buffer.indexOf("\n");
    if (line) handleLine(line);
  }
});

process.stdin.on("end", () => process.exit(0));

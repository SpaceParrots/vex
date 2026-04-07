#!/usr/bin/env node

import { startMcpServer } from "./mcp.js";
import { createCli } from "./cli.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const firstArg = args[0];

  // Default (no args) or explicit "serve" → MCP server
  if (!firstArg || firstArg === "serve") {
    await startMcpServer();
    return;
  }

  // Everything else → CLI
  const program = createCli();
  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});

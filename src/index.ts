#!/usr/bin/env node
/**
 * @module index
 *
 * Entry point for vex. Routes to MCP server mode (default, no args or "serve")
 * or CLI mode (any other argument) via Commander.
 */

import { startMcpServer } from "./mcp.js";
import { createCli } from "./cli.js";

/** Determines the execution mode and starts the appropriate interface. */
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

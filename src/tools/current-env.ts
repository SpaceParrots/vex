/** @module tools/current-env — MCP tool reporting the environment currently in use. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { currentEnvLine } from "../services/env.js";

/** Registers the `vex_current_env` MCP tool. */
export function registerCurrentEnvTool(server: McpServer): void {
  server.tool(
    "vex_current_env",
    "Show which Vendure environment vex is currently using (resolution order: env param > VEX_ENV > active). Call this when unsure which environment an operation will hit.",
    {},
    async () => ({
      content: [{ type: "text" as const, text: await currentEnvLine() }],
    })
  );
}

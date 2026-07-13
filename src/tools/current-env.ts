/** @module tools/current-env — MCP tool reporting the environment currently in use. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { currentEnvInfo } from "../services/env.js";
import { jsonContent } from "../output.js";

/** Registers the `vex_current_env` MCP tool. */
export function registerCurrentEnvTool(server: McpServer): void {
  server.tool(
    "vex_current_env",
    "Show which Vendure environment vex is using and why (env param > VEX_ENV > project link > active). Returns {name, host, source, projectPath?} or a none-configured notice.",
    {},
    async () => {
      const info = await currentEnvInfo();
      if (!info) {
        return { content: [{ type: "text" as const, text: "none configured" }] };
      }
      return jsonContent(info);
    }
  );
}

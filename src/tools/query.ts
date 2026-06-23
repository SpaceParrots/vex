/** @module tools/query — MCP tool for executing arbitrary GraphQL queries. */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executeQuery } from "../services/query.js";
import { envAwareTool } from "./env-aware.js";

/** Registers the `vex_query` MCP tool with error-aware response handling. */
export function registerQueryTool(server: McpServer): void {
  envAwareTool(server,
    "vex_query",
    "Execute a GraphQL query against the active Vendure Admin API environment.",
    {
      query: z.string().describe("GraphQL query string"),
      variables: z.record(z.unknown()).optional().describe("Variables for the GraphQL query"),
    },
    async (input) => {
      try {
        const data = await executeQuery(input.query, input.variables);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : JSON.stringify(err);
        return {
          content: [{ type: "text" as const, text: `GraphQL error: ${message}` }],
          isError: true,
        };
      }
    }
  );
}

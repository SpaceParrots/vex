/** @module tools/mutate — MCP tool for executing arbitrary GraphQL mutations. */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executeMutation } from "../services/query.js";
import { jsonContent } from "../output.js";
import { envAwareTool } from "./env-aware.js";

/** Registers the `vex_mutate` MCP tool with error-aware response handling. */
export function registerMutateTool(server: McpServer): void {
  envAwareTool(server,
    "vex_mutate",
    "Execute a GraphQL mutation against the active Vendure Admin API environment.",
    {
      mutation: z.string().describe("GraphQL mutation string"),
      variables: z.record(z.unknown()).optional().describe("Variables for the GraphQL mutation"),
    },
    async (input) => {
      try {
        const data = await executeMutation(input.mutation, input.variables);
        return jsonContent(data);
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

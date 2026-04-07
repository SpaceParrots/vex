import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchSchemaForEnv } from "../services/schema.js";

export function registerRefetchSchemaTool(server: McpServer): void {
  server.tool(
    "vendure_refetch_schema",
    "Re-fetch and cache the GraphQL schema for a Vendure environment. Uses introspection or the configured schema source.",
    {
      environment: z.string().optional().describe(
        "Target environment name. Defaults to active environment."
      ),
    },
    async (input) => {
      const result = await fetchSchemaForEnv(input.environment);

      return {
        content: [
          {
            type: "text" as const,
            text: [
              `Schema refreshed for "${result.name}".`,
              `Types: ${result.typeCount}`,
              `Query fields: ${result.queryFields}`,
              `Mutation fields: ${result.mutationFields}`,
            ].join("\n"),
          },
        ],
      };
    }
  );
}

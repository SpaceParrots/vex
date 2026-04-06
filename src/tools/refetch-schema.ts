import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getActiveEnv, loadConfig } from "../config.js";
import { refetchSchema } from "../schema.js";

const RefetchSchemaInputSchema = z.object({
  environment: z
    .string()
    .optional()
    .describe("Target environment name. Defaults to active environment."),
});

export function registerRefetchSchemaTool(server: McpServer): void {
  server.tool(
    "vendure_refetch_schema",
    "Re-fetch and cache the GraphQL schema for a Vendure environment. Uses introspection or the configured schema source.",
    RefetchSchemaInputSchema.shape,
    async (input) => {
      let name: string;
      let env;

      if (input.environment) {
        const config = await loadConfig();
        const target = config.environments[input.environment];
        if (!target) {
          throw new Error(`Environment "${input.environment}" not found.`);
        }
        name = input.environment;
        env = target;
      } else {
        const active = await getActiveEnv();
        name = active.name;
        env = active.env;
      }

      const sdl = await refetchSchema(env, name);

      // Count types and root fields
      const typeMatches = sdl.match(/^type\s+\w+/gm);
      const typeCount = typeMatches?.length ?? 0;

      const queryMatch = sdl.match(
        /type Query \{([^}]*)\}/s
      );
      const queryFields = queryMatch
        ? queryMatch[1].split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).length
        : 0;

      const mutationMatch = sdl.match(
        /type Mutation \{([^}]*)\}/s
      );
      const mutationFields = mutationMatch
        ? mutationMatch[1].split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).length
        : 0;

      return {
        content: [
          {
            type: "text" as const,
            text: [
              `Schema refreshed for "${name}".`,
              `Types: ${typeCount}`,
              `Query fields: ${queryFields}`,
              `Mutation fields: ${mutationFields}`,
            ].join("\n"),
          },
        ],
      };
    }
  );
}

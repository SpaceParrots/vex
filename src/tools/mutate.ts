import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getActiveEnv } from "../config.js";
import { createClient } from "../client.js";

const MutateInputSchema = z.object({
  mutation: z.string().describe("GraphQL mutation string"),
  variables: z
    .record(z.unknown())
    .optional()
    .describe("Variables for the GraphQL mutation"),
});

export function registerMutateTool(server: McpServer): void {
  server.tool(
    "vendure_mutate",
    "Execute a GraphQL mutation against the active Vendure Admin API environment.",
    MutateInputSchema.shape,
    async (input) => {
      const { env } = await getActiveEnv();
      const client = createClient(env);

      try {
        const data = await client.request(input.mutation, input.variables);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : JSON.stringify(err);
        return {
          content: [{ type: "text" as const, text: `GraphQL error: ${message}` }],
          isError: true,
        };
      }
    }
  );
}

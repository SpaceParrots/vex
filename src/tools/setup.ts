import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  addEnv,
  removeEnv,
  switchEnv,
  listEnvs,
  loadConfig,
  type Environment,
} from "../config.js";
import { refetchSchema } from "../schema.js";

const ActionSchema = z.enum(["add", "remove", "list", "switch", "show"]);

const SetupInputSchema = z.object({
  action: ActionSchema.describe("Action to perform: add, remove, list, switch, or show"),
  name: z
    .string()
    .optional()
    .describe("Environment name (required for add/remove/switch, optional for show)"),
  url: z
    .string()
    .optional()
    .describe("Vendure Admin API URL (required for add)"),
  apiKey: z
    .string()
    .optional()
    .describe("Vendure API key (required for add)"),
  schemaType: z
    .enum(["endpoint", "file"])
    .optional()
    .describe("Schema source type: 'endpoint' for introspection, 'file' for local SDL"),
  schemaValue: z
    .string()
    .optional()
    .describe("Schema source value: URL for endpoint or file path for file"),
  fetchSchema: z
    .boolean()
    .optional()
    .describe("If true, fetch and cache schema immediately after adding"),
});

export function registerSetupTool(server: McpServer): void {
  server.tool(
    "vendure_setup",
    "Manage Vendure API environments. Add, remove, list, switch between, or show environment configurations.",
    SetupInputSchema.shape,
    async (input) => {
      const { action, name } = input;

      switch (action) {
        case "add": {
          if (!name) throw new Error("'name' is required for add action.");
          if (!input.url) throw new Error("'url' is required for add action.");
          if (!input.apiKey)
            throw new Error("'apiKey' is required for add action.");

          const env: Environment = {
            url: input.url,
            apiKey: input.apiKey,
            ...(input.schemaType && {
              schemaSource: {
                type: input.schemaType,
                value: input.schemaValue,
              },
            }),
          };

          const config = await addEnv(name, env);
          let result = `Environment "${name}" added.`;
          if (config.activeEnvironment === name) {
            result += " Set as active.";
          }

          if (input.fetchSchema && env.schemaSource) {
            try {
              await refetchSchema(env, name);
              result += " Schema fetched and cached.";
            } catch (err) {
              result += ` Schema fetch failed: ${err instanceof Error ? err.message : String(err)}`;
            }
          }

          return { content: [{ type: "text" as const, text: result }] };
        }

        case "remove": {
          if (!name) throw new Error("'name' is required for remove action.");
          await removeEnv(name);
          return {
            content: [
              {
                type: "text" as const,
                text: `Environment "${name}" removed.`,
              },
            ],
          };
        }

        case "list": {
          const { active, environments } = await listEnvs();
          if (Object.keys(environments).length === 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "No environments configured. Use action 'add' to create one.",
                },
              ],
            };
          }
          const lines = Object.entries(environments).map(
            ([n, e]) =>
              `${n === active ? "[active] " : ""}${n}: ${e.url}`
          );
          return {
            content: [{ type: "text" as const, text: lines.join("\n") }],
          };
        }

        case "switch": {
          if (!name) throw new Error("'name' is required for switch action.");
          await switchEnv(name);
          return {
            content: [
              {
                type: "text" as const,
                text: `Switched active environment to "${name}".`,
              },
            ],
          };
        }

        case "show": {
          const config = await loadConfig();
          const targetName = name ?? config.activeEnvironment;
          if (!targetName) {
            throw new Error("No environment specified and no active environment set.");
          }
          const env = config.environments[targetName];
          if (!env) {
            throw new Error(`Environment "${targetName}" not found.`);
          }
          const info = {
            name: targetName,
            active: config.activeEnvironment === targetName,
            ...env,
            apiKey: env.apiKey.slice(0, 4) + "****",
          };
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(info, null, 2),
              },
            ],
          };
        }
      }
    }
  );
}

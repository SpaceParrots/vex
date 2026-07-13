/** @module tools/setup — MCP tool for managing Vendure environments (add, remove, list, switch, show, set). */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  addEnvironment,
  removeEnvironment,
  switchEnvironment,
  updateEnvironment,
  listEnvironments,
  showEnvironment,
} from "../services/env.js";
import { toolErrorResult } from "./action-tool.js";

const SetupInputSchema = z.object({
  action: z.enum(["add", "remove", "list", "switch", "show", "set"]).describe(
    "Action to perform: add, remove, list, switch, show, or set"
  ),
  name: z.string().optional().describe(
    "Environment name (required for add/remove/switch, optional for show/set — defaults to active)"
  ),
  url: z.string().optional().describe("Vendure Admin API URL (required for add)"),
  apiKey: z.string().optional().describe("Vendure API key (required for add)"),
  schemaType: z.enum(["endpoint", "file"]).optional().describe(
    "Schema source type: 'endpoint' for introspection, 'file' for local SDL"
  ),
  schemaValue: z.string().optional().describe(
    "Schema source value: URL for endpoint or file path for file"
  ),
  fetchSchema: z.boolean().optional().describe(
    "If true, fetch and cache schema immediately after adding"
  ),
});

/** Registers the `vex_setup` MCP tool for environment CRUD operations. */
export function registerSetupTool(server: McpServer): void {
  server.tool(
    "vex_setup",
    "Manage Vendure API environments: add, remove, list, switch, show, or set (update).",
    SetupInputSchema.shape,
    async (input) => {
      try {
        switch (input.action) {
          case "add": {
            if (!input.name) throw new Error("'name' is required for add action.");
            if (!input.url) throw new Error("'url' is required for add action.");
            if (!input.apiKey) throw new Error("'apiKey' is required for add action.");

            const result = await addEnvironment({
              name: input.name,
              url: input.url,
              apiKey: input.apiKey,
              schemaType: input.schemaType,
              schemaValue: input.schemaValue,
              fetchSchema: input.fetchSchema,
            });

            let text = `Environment "${result.name}" added.`;
            if (result.isActive) text += " Set as active.";
            if (result.schemaFetched) text += " Schema fetched and cached.";
            if (result.schemaError) text += ` Schema fetch failed: ${result.schemaError}`;

            return { content: [{ type: "text" as const, text }] };
          }

          case "remove": {
            if (!input.name) throw new Error("'name' is required for remove action.");
            await removeEnvironment(input.name);
            return {
              content: [{ type: "text" as const, text: `Environment "${input.name}" removed.` }],
            };
          }

          case "list": {
            const { active, environments } = await listEnvironments();
            if (Object.keys(environments).length === 0) {
              return {
                content: [{ type: "text" as const, text: "No environments configured. Use action 'add' to create one." }],
              };
            }
            const lines = Object.entries(environments).map(
              ([n, e]) => `${n === active ? "[active] " : ""}${n}: ${e.url}`
            );
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "switch": {
            if (!input.name) throw new Error("'name' is required for switch action.");
            await switchEnvironment(input.name);
            return {
              content: [{ type: "text" as const, text: `Switched active environment to "${input.name}".` }],
            };
          }

          case "show": {
            const info = await showEnvironment(input.name);
            return {
              content: [{ type: "text" as const, text: JSON.stringify(info, null, 2) }],
            };
          }

          case "set": {
            const result = await updateEnvironment({
              name: input.name,
              url: input.url,
              apiKey: input.apiKey,
              schemaType: input.schemaType,
              schemaValue: input.schemaValue,
            });
            return {
              content: [{ type: "text" as const, text: `Environment "${result.name}" updated: ${result.updated.join(", ")}.` }],
            };
          }
        }
      } catch (err) {
        return toolErrorResult(err);
      }
    }
  );
}

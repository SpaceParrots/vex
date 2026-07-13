/** @module tools/operations — `vex_operations` action-dispatch MCP tool for managing and running saved GraphQL operations. */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getCurrentEnv } from "../context.js";
import { getClient } from "../client.js";
import { jsonContent } from "../output.js";
import { actionTool } from "./action-tool.js";
import {
  listOperations,
  loadOperation,
  deleteOperation,
  mergeVariables,
} from "../services/operations.js";

/** Registers the `vex_operations` MCP tool covering saved (replayable) operation management. */
export function registerOperationTools(server: McpServer): void {
  actionTool(
    server,
    "vex_operations",
    "Manage saved (replayable) GraphQL operations: queries or mutations persisted with default variables. (Distinct from vex_schema's list_operations, which lists schema-defined operations.)",
    {
      list: {
        summary: "List saved operations, optionally filtered by kind or root field.",
        shape: {
          kind: z.enum(["query", "mutation"]).optional().describe("Filter by operation kind."),
          rootField: z.string().optional().describe("Filter by the root field name (e.g. `contents`, `createCustomer`)."),
        },
        handler: async (a) => {
          const { name: envName } = await getCurrentEnv();
          return jsonContent(
            await listOperations({
              envName,
              kind: a.kind as "query" | "mutation" | undefined,
              rootField: a.rootField as string | undefined,
            })
          );
        },
      },
      get: {
        summary: "Return the full saved-operation record (name, kind, rootField, document, default variables, timestamps).",
        shape: {
          name: z.string().describe("Saved operation name (CamelCase)."),
        },
        handler: async (a) => {
          const { name: envName } = await getCurrentEnv();
          return jsonContent(await loadOperation({ envName, name: a.name as string }));
        },
      },
      run: {
        summary: "Execute a saved operation by name. Override top-level variables (shallow merge) or replace them entirely.",
        shape: {
          name: z.string().describe("Saved operation name (CamelCase)."),
          variableOverrides: z
            .record(z.unknown())
            .optional()
            .describe("Top-level variable overrides merged into the saved defaults. Pass values as their real JSON types (e.g. `true`, `42`, `{...}`)."),
          replaceVariables: z
            .record(z.unknown())
            .optional()
            .describe("If set, replaces the saved defaults entirely before applying variableOverrides. Use this when the saved variables are stale."),
        },
        handler: async (a) => {
          const { name: envName } = await getCurrentEnv();
          const rec = await loadOperation({ envName, name: a.name as string });
          const base = (a.replaceVariables as Record<string, unknown> | undefined) ?? rec.variables;
          // Always merge through mergeVariables so reserved-key guards apply.
          const finalVars = mergeVariables(
            base as Record<string, unknown>,
            (a.variableOverrides ?? {}) as Record<string, unknown>
          );
          const client = await getClient();
          const data = await client.request(rec.document, finalVars);
          return jsonContent({ data, variables: finalVars });
        },
      },
      delete: {
        summary: "Delete a saved operation.",
        shape: {
          name: z.string().describe("Saved operation name (CamelCase)."),
        },
        handler: async (a) => {
          const { name: envName } = await getCurrentEnv();
          return jsonContent(await deleteOperation({ envName, name: a.name as string }));
        },
      },
    }
  );
}

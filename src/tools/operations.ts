/** @module tools/operations — MCP tools for managing and running saved GraphQL operations. */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getCurrentEnv } from "../env-context.js";
import { getClient } from "../client.js";
import { jsonContent } from "../output.js";
import { envAwareTool } from "./env-aware.js";
import {
  listOperations,
  loadOperation,
  deleteOperation,
  mergeVariables,
} from "../services/operations.js";

export function registerOperationTools(server: McpServer): void {
  envAwareTool(server,
    "vex_list_saved_operations",
    "List saved (replayable) GraphQL operations for the active environment. A saved operation is a previously-built query or mutation persisted with its default variables that can be replayed via vex_run_saved_operation. Distinct from vex_list_operations, which lists operations available on the schema. Optionally filter by kind (query/mutation) or by the rootField the operation targets.",
    {
      kind: z
        .enum(["query", "mutation"])
        .optional()
        .describe("Filter by operation kind."),
      rootField: z
        .string()
        .optional()
        .describe("Filter by the root field name (e.g. `contents`, `createCustomer`)."),
    },
    async ({ kind, rootField }) => {
      const { name: envName } = await getCurrentEnv();
      return jsonContent(await listOperations({ envName, kind, rootField }));
    }
  );

  envAwareTool(server,
    "vex_get_saved_operation",
    "Return the full saved-operation record (name, kind, rootField, document, default variables, timestamps) for the active environment.",
    {
      name: z.string().describe("Saved operation name (CamelCase)."),
    },
    async ({ name }) => {
      const { name: envName } = await getCurrentEnv();
      return jsonContent(await loadOperation({ envName, name }));
    }
  );

  envAwareTool(server,
    "vex_run_saved_operation",
    "Execute a saved GraphQL operation by name against the active environment. Optionally override top-level variables; overrides are applied on top of the saved defaults via a shallow merge.",
    {
      name: z.string().describe("Saved operation name (CamelCase)."),
      variableOverrides: z
        .record(z.unknown())
        .optional()
        .describe(
          "Top-level variable overrides merged into the saved defaults. Pass values as their real JSON types (e.g. `true`, `42`, `{...}`)."
        ),
      replaceVariables: z
        .record(z.unknown())
        .optional()
        .describe(
          "If set, replaces the saved defaults entirely before applying variableOverrides. Use this when the saved variables are stale."
        ),
    },
    async ({ name, variableOverrides, replaceVariables }) => {
      const { name: envName } = await getCurrentEnv();
      const rec = await loadOperation({ envName, name });
      const base = replaceVariables ?? rec.variables;
      // Always merge through mergeVariables so reserved-key guards apply.
      const finalVars = mergeVariables(
        base as Record<string, unknown>,
        (variableOverrides ?? {}) as Record<string, unknown>
      );
      const client = await getClient();
      const data = await client.request(rec.document, finalVars);
      return jsonContent({ data, variables: finalVars });
    }
  );

  envAwareTool(server,
    "vex_delete_saved_operation",
    "Delete a saved operation from the active environment.",
    {
      name: z.string().describe("Saved operation name (CamelCase)."),
    },
    async ({ name }) => {
      const { name: envName } = await getCurrentEnv();
      return jsonContent(await deleteOperation({ envName, name }));
    }
  );
}

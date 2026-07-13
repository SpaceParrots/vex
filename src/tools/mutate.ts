/** @module tools/mutate — MCP tool for executing arbitrary GraphQL mutations (incl. Upload files). */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executeMutation, executeMutationWithFiles } from "../services/query.js";
import { jsonContent } from "../output.js";
import { envAwareTool } from "./env-aware.js";
import { toolErrorResult } from "./action-tool.js";

/** Registers the `vex_mutate` MCP tool with error-aware response handling. */
export function registerMutateTool(server: McpServer): void {
  envAwareTool(
    server,
    "vex_mutate",
    "Execute a GraphQL mutation against the Vendure Admin API. Supports Upload-scalar file uploads via `files`.",
    {
      mutation: z.string().describe("GraphQL mutation string"),
      variables: z.record(z.unknown()).optional().describe("Variables for the GraphQL mutation"),
      files: z
        .record(z.string())
        .optional()
        .describe(
          'For Upload-scalar variables: map of dotted variable path to local file path, e.g. {"input.0.file": "./logo.png"}.'
        ),
    },
    async (input) => {
      try {
        const data =
          input.files && Object.keys(input.files).length > 0
            ? await executeMutationWithFiles(input.mutation, input.variables, input.files as Record<string, string>)
            : await executeMutation(input.mutation, input.variables);
        return jsonContent(data);
      } catch (err: unknown) {
        return toolErrorResult(err);
      }
    }
  );
}

/** @module tools/schemaIntrospection — `vex_schema` action-dispatch MCP tool for slice-based schema discovery. */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getCurrentEnv } from "../env-context.js";
import { loadSchema } from "../schema.js";
import { parseSchemaFromSdl } from "../schema-model/parse.js";
import { jsonContent } from "../output.js";
import { actionTool } from "./action-tool.js";
import {
  describeType,
  listCustomFields,
  listOperations,
  describeOperation,
} from "../services/schema-introspect.js";

async function loadParsedSchema() {
  const { name, env } = await getCurrentEnv();
  const sdl = await loadSchema(env, name);
  return parseSchemaFromSdl(name, sdl);
}

/** Registers the `vex_schema` MCP tool covering schema introspection operations. */
export function registerSchemaIntrospectionTools(server: McpServer): void {
  actionTool(server, "vex_schema", "Discover the Vendure Admin GraphQL schema (types, operations, custom fields).", {
    describe_type: {
      summary: "Return SDL for a type plus SDL for every type it references (depth 1 or 2). Skips built-in scalars.",
      shape: {
        typeName: z.string().describe("Name of the GraphQL type to describe (e.g. 'Customer')."),
        depth: z.union([z.literal(1), z.literal(2)]).optional().describe("Depth of referenced-type expansion. Default 1, max 2."),
      },
      handler: async (a) => {
        const schema = await loadParsedSchema();
        const sdl = describeType(schema, a.typeName as string, (a.depth as 1 | 2 | undefined) ?? 1);
        return { content: [{ type: "text" as const, text: sdl }] };
      },
    },
    list_custom_fields: {
      summary: "List the custom fields configured on a Vendure entity. Returns null when it has no typed customFields block.",
      shape: {
        typeName: z.string().describe("Entity type name (e.g. 'Customer', 'Product', 'Order')."),
      },
      handler: async (a) => {
        const schema = await loadParsedSchema();
        return jsonContent(listCustomFields(schema, a.typeName as string));
      },
    },
    list_operations: {
      summary: "List available top-level queries and mutations, optionally filtered by kind and substring.",
      shape: {
        kind: z.enum(["query", "mutation"]).optional().describe("Filter by operation kind."),
        search: z.string().optional().describe("Case-insensitive substring filter on the operation name."),
      },
      handler: async (a) => {
        const schema = await loadParsedSchema();
        return jsonContent(
          listOperations(schema, {
            kind: a.kind as "query" | "mutation" | undefined,
            search: a.search as string | undefined,
          })
        );
      },
    },
    describe_operation: {
      summary: "Return the SDL signature of one operation, plus SDL for its arg input types and return type.",
      shape: {
        name: z.string().describe("Operation (root field) name (e.g. 'customers', 'createCustomer')."),
      },
      handler: async (a) => {
        const schema = await loadParsedSchema();
        return { content: [{ type: "text" as const, text: describeOperation(schema, a.name as string) }] };
      },
    },
  });
}

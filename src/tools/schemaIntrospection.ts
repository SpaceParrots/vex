/** @module tools/schemaIntrospection — MCP tools for slice-based schema discovery. */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getActiveEnv } from "../config.js";
import { loadSchema } from "../schema.js";
import { parseSchemaFromSdl } from "../schema-model/parse.js";
import { jsonContent } from "../output.js";
import {
  describeType,
  listCustomFields,
  listOperations,
  describeOperation,
} from "../services/schema-introspect.js";

async function loadParsedSchema() {
  const { name, env } = await getActiveEnv();
  const sdl = await loadSchema(env, name);
  return parseSchemaFromSdl(name, sdl);
}

export function registerSchemaIntrospectionTools(server: McpServer): void {
  server.tool(
    "vex_describe_type",
    "Return SDL for a type plus SDL for every type it references (depth 1 or 2). Skips built-in scalars.",
    {
      typeName: z.string().describe("Name of the GraphQL type to describe (e.g. 'Customer')."),
      depth: z.union([z.literal(1), z.literal(2)]).optional().describe("Depth of referenced-type expansion. Default 1, max 2."),
    },
    async ({ typeName, depth }) => {
      const schema = await loadParsedSchema();
      const sdl = describeType(schema, typeName, depth ?? 1);
      return { content: [{ type: "text" as const, text: sdl }] };
    }
  );

  server.tool(
    "vex_list_custom_fields",
    "List the custom fields configured on a Vendure entity (e.g. 'Customer', 'Product', 'Order'). Returns null when the entity has no typed customFields block.",
    {
      typeName: z.string().describe("Entity type name (e.g. 'Customer', 'Product', 'Order')."),
    },
    async ({ typeName }) => {
      const schema = await loadParsedSchema();
      return jsonContent(listCustomFields(schema, typeName));
    }
  );

  server.tool(
    "vex_list_operations",
    "List available top-level queries and mutations, optionally filtered by kind and substring.",
    {
      kind: z.enum(["query", "mutation"]).optional().describe("Filter by operation kind."),
      search: z.string().optional().describe("Case-insensitive substring filter on the operation name."),
    },
    async ({ kind, search }) => {
      const schema = await loadParsedSchema();
      return jsonContent(listOperations(schema, { kind, search }));
    }
  );

  server.tool(
    "vex_describe_operation",
    "Return the SDL signature of one operation, plus SDL for its arg input types and return type.",
    {
      name: z.string().describe("Operation (root field) name (e.g. 'customers', 'createCustomer')."),
    },
    async ({ name }) => {
      const schema = await loadParsedSchema();
      return { content: [{ type: "text" as const, text: describeOperation(schema, name) }] };
    }
  );
}

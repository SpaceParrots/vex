/** @module tools/fragments — MCP tools for managing saved GraphQL fragments. */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getActiveEnv } from "../config.js";
import { loadSchema } from "../schema.js";
import { parseSchemaFromSdl } from "../schema-model/parse.js";
import { jsonContent } from "../output.js";
import {
  listFragments,
  getFragmentSdl,
  saveFragment,
  deleteFragment,
} from "../services/fragments.js";

async function loadCtx() {
  const { name, env } = await getActiveEnv();
  const sdl = await loadSchema(env, name);
  return { envName: name, schema: parseSchemaFromSdl(name, sdl) };
}

export function registerFragmentTools(server: McpServer): void {
  server.tool(
    "vex_list_fragments",
    "List saved GraphQL fragments for the active environment, optionally filtered by on-clause type.",
    {
      type: z.string().optional().describe("Filter to fragments whose on-clause matches this type name."),
    },
    async ({ type }) => {
      const { envName } = await loadCtx();
      return jsonContent(await listFragments({ envName, onType: type }));
    }
  );

  server.tool(
    "vex_get_fragment",
    "Return the raw SDL of a saved fragment.",
    {
      name: z.string().describe("Fragment name (CamelCase)."),
    },
    async ({ name }) => {
      const { envName } = await loadCtx();
      const sdl = await getFragmentSdl({ envName, name });
      return { content: [{ type: "text" as const, text: sdl }] };
    }
  );

  server.tool(
    "vex_save_fragment",
    "Persist a GraphQL fragment definition to the active environment's fragment store. Validates the selection against the cached schema before writing.",
    {
      name: z.string().describe("Fragment name (CamelCase). Must match the name in the SDL."),
      sdl: z.string().describe("Full SDL: `fragment Name on Type { ... }`."),
      overwrite: z.boolean().optional().describe("Replace an existing fragment with the same name. Default false."),
    },
    async ({ name, sdl, overwrite }) => {
      const { envName, schema } = await loadCtx();
      const result = await saveFragment({ envName, name, sdl, schema, overwrite });
      return jsonContent(result);
    }
  );

  server.tool(
    "vex_delete_fragment",
    "Delete a saved fragment from the active environment.",
    {
      name: z.string().describe("Fragment name (CamelCase)."),
    },
    async ({ name }) => {
      const { envName } = await loadCtx();
      return jsonContent(await deleteFragment({ envName, name }));
    }
  );
}

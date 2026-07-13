/** @module tools/fragments — `vex_fragments` action-dispatch MCP tool for managing saved GraphQL fragments. */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getCurrentEnv } from "../context.js";
import { loadSchema } from "../schema.js";
import { parseSchemaFromSdl } from "../schema-model/parse.js";
import { jsonContent } from "../output.js";
import { actionTool } from "./action-tool.js";
import {
  listFragments,
  getFragmentSdl,
  saveFragment,
  deleteFragment,
} from "../services/fragments.js";

async function loadCtx() {
  const { name, env } = await getCurrentEnv();
  const sdl = await loadSchema(env, name);
  return { envName: name, schema: parseSchemaFromSdl(name, sdl) };
}

/** Registers the `vex_fragments` MCP tool covering saved-fragment operations. */
export function registerFragmentTools(server: McpServer): void {
  actionTool(server, "vex_fragments", "Manage reusable GraphQL fragments (named selection sets).", {
    list: {
      summary: "List saved fragments, optionally filtered by on-clause type.",
      shape: {
        type: z.string().optional().describe("Filter to fragments whose on-clause matches this type name."),
      },
      handler: async (a) => {
        const { envName } = await loadCtx();
        return jsonContent(await listFragments({ envName, onType: a.type as string | undefined }));
      },
    },
    get: {
      summary: "Return the raw SDL of a saved fragment.",
      shape: {
        name: z.string().describe("Fragment name (CamelCase)."),
      },
      handler: async (a) => {
        const { envName } = await loadCtx();
        const sdl = await getFragmentSdl({ envName, name: a.name as string });
        return { content: [{ type: "text" as const, text: sdl }] };
      },
    },
    save: {
      summary: "Persist a fragment definition, validating its selection against the cached schema before writing.",
      shape: {
        name: z.string().describe("Fragment name (CamelCase). Must match the name in the SDL."),
        sdl: z.string().describe("Full SDL: `fragment Name on Type { ... }`."),
        overwrite: z.boolean().optional().describe("Replace an existing fragment with the same name. Default false."),
      },
      handler: async (a) => {
        const { envName, schema } = await loadCtx();
        const result = await saveFragment({
          envName,
          name: a.name as string,
          sdl: a.sdl as string,
          schema,
          overwrite: a.overwrite as boolean | undefined,
        });
        return jsonContent(result);
      },
    },
    delete: {
      summary: "Delete a saved fragment.",
      shape: {
        name: z.string().describe("Fragment name (CamelCase)."),
      },
      handler: async (a) => {
        const { envName } = await loadCtx();
        return jsonContent(await deleteFragment({ envName, name: a.name as string }));
      },
    },
  });
}

/** @module tools/assets — `vex_assets` action-dispatch MCP tool for Vendure assets. */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  uploadAssets,
  listAssets,
  getAsset,
  updateAsset,
  deleteAsset,
} from "../services/assets.js";
import { jsonContent } from "../output.js";
import { actionTool } from "./action-tool.js";

/** Registers the `vex_assets` MCP tool (upload, list, get, update, delete). */
export function registerAssetTools(server: McpServer): void {
  actionTool(server, "vex_assets", "Manage Vendure assets (images/files), incl. multipart upload of local files.", {
    upload: {
      summary: "Upload local files as new assets (Upload scalar via multipart request).",
      shape: {
        filePaths: z.array(z.string()).min(1).describe("Local file paths to upload."),
        tags: z.array(z.string()).optional().describe("Tags applied to every uploaded asset."),
      },
      handler: async (a) =>
        jsonContent(
          await uploadAssets({
            filePaths: a.filePaths as string[],
            tags: a.tags as string[] | undefined,
          })
        ),
    },
    list: {
      summary: "List assets (take/skip pagination, optional name substring filter).",
      shape: {
        take: z.number().int().positive().optional().describe("Items per page (default 20)."),
        skip: z.number().int().nonnegative().optional().describe("Items to skip (default 0)."),
        nameContains: z.string().optional().describe("Filter by name substring."),
      },
      handler: async (a) =>
        jsonContent(
          await listAssets({
            take: a.take as number | undefined,
            skip: a.skip as number | undefined,
            nameContains: a.nameContains as string | undefined,
          })
        ),
    },
    get: {
      summary: "Fetch one asset by ID (incl. focal point and tags).",
      shape: { id: z.string().describe("Asset ID.") },
      handler: async (a) => jsonContent(await getAsset(a.id as string)),
    },
    update: {
      summary: "Update an asset's name, tags, or focal point.",
      shape: {
        id: z.string().describe("Asset ID."),
        name: z.string().optional().describe("New asset name."),
        tags: z.array(z.string()).optional().describe("Replacement tag list."),
        focalPoint: z
          .object({ x: z.number(), y: z.number() })
          .optional()
          .describe("Focal point as fractions, e.g. {x:0.5, y:0.5}."),
      },
      handler: async (a) =>
        jsonContent(
          await updateAsset({
            id: a.id as string,
            name: a.name as string | undefined,
            tags: a.tags as string[] | undefined,
            focalPoint: a.focalPoint as { x: number; y: number } | undefined,
          })
        ),
    },
    delete: {
      summary: "Delete an asset by ID.",
      shape: { id: z.string().describe("Asset ID.") },
      handler: async (a) => jsonContent(await deleteAsset(a.id as string)),
    },
  });
}

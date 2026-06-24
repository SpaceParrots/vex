/** @module tools/channels — `vex_channels` action-dispatch MCP tool (list, get, get_active, update). */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  listChannels,
  getChannel,
  getActiveChannel,
  updateChannel,
} from "../services/channels.js";
import { jsonContent } from "../output.js";
import { actionTool } from "./action-tool.js";

/** Registers the `vex_channels` MCP tool covering all channel operations. */
export function registerChannelTools(server: McpServer): void {
  actionTool(server, "vex_channels", "Manage Vendure channels.", {
    list: {
      summary: "List channels with optional pagination.",
      shape: {
        take: z.number().optional().describe("Number of results to return"),
        skip: z.number().optional().describe("Number of results to skip"),
      },
      handler: async (a) => jsonContent(await listChannels(a as Parameters<typeof listChannels>[0])),
    },
    get: {
      summary: "Get a channel by ID.",
      shape: { id: z.string().describe("Channel ID") },
      handler: async (a) => jsonContent(await getChannel(a.id as string)),
    },
    get_active: {
      summary: "Get the currently active channel.",
      shape: {},
      handler: async () => jsonContent(await getActiveChannel()),
    },
    update: {
      summary: "Update channel settings (default tax/shipping zone, currency, language, inventory).",
      shape: {
        id: z.string().describe("Channel ID"),
        defaultTaxZoneId: z.string().optional().describe("Default tax zone ID"),
        defaultShippingZoneId: z.string().optional().describe("Default shipping zone ID"),
        defaultLanguageCode: z.string().optional().describe("Default language code (e.g. 'en')"),
        defaultCurrencyCode: z.string().optional().describe("Default currency code (e.g. 'USD', 'INR')"),
        pricesIncludeTax: z.boolean().optional().describe("Whether prices include tax"),
        trackInventory: z.boolean().optional().describe("Whether to track inventory"),
        outOfStockThreshold: z.number().optional().describe("Out of stock threshold"),
      },
      handler: async (a) => jsonContent(await updateChannel(a as unknown as Parameters<typeof updateChannel>[0])),
    },
  });
}

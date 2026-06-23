/** @module tools/channels — MCP tools for channel management (list, get, get-active, update). */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  listChannels,
  getChannel,
  getActiveChannel,
  updateChannel,
} from "../services/channels.js";
import { jsonContent } from "../output.js";
import { envAwareTool } from "./env-aware.js";

/** Registers all `vex_*_channel*` MCP tools for channel operations. */
export function registerChannelTools(server: McpServer): void {
  envAwareTool(server,
    "vex_get_channels",
    "List channels with optional pagination.",
    {
      take: z.number().optional().describe("Number of results to return"),
      skip: z.number().optional().describe("Number of results to skip"),
    },
    async (input) => jsonContent(await listChannels(input))
  );

  envAwareTool(server,
    "vex_get_channel",
    "Get a channel by ID.",
    { id: z.string().describe("Channel ID") },
    async (input) => jsonContent(await getChannel(input.id))
  );

  envAwareTool(server,
    "vex_get_active_channel",
    "Get the currently active channel.",
    {},
    async () => jsonContent(await getActiveChannel())
  );

  envAwareTool(server,
    "vex_update_channel",
    "Update channel settings including default tax zone, default shipping zone, currency, language, and more.",
    {
      id: z.string().describe("Channel ID"),
      defaultTaxZoneId: z.string().optional().describe("Default tax zone ID"),
      defaultShippingZoneId: z.string().optional().describe("Default shipping zone ID"),
      defaultLanguageCode: z.string().optional().describe("Default language code (e.g. 'en')"),
      defaultCurrencyCode: z.string().optional().describe("Default currency code (e.g. 'USD', 'INR')"),
      pricesIncludeTax: z.boolean().optional().describe("Whether prices include tax"),
      trackInventory: z.boolean().optional().describe("Whether to track inventory"),
      outOfStockThreshold: z.number().optional().describe("Out of stock threshold"),
    },
    async (input) => jsonContent(await updateChannel(input))
  );
}

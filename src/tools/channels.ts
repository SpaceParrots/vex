import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  listChannels,
  getChannel,
  getActiveChannel,
  updateChannel,
} from "../services/channels.js";

function jsonContent(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export function registerChannelTools(server: McpServer): void {
  server.tool(
    "vendure_get_channels",
    "List channels with optional pagination.",
    {
      take: z.number().optional().describe("Number of results to return"),
      skip: z.number().optional().describe("Number of results to skip"),
    },
    async (input) => jsonContent(await listChannels(input))
  );

  server.tool(
    "vendure_get_channel",
    "Get a channel by ID.",
    { id: z.string().describe("Channel ID") },
    async (input) => jsonContent(await getChannel(input.id))
  );

  server.tool(
    "vendure_get_active_channel",
    "Get the currently active channel.",
    {},
    async () => jsonContent(await getActiveChannel())
  );

  server.tool(
    "vendure_update_channel",
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

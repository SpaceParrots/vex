/** @module tools/tax — `vex_tax` action-dispatch MCP tool for tax category and tax rate management. */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  listTaxCategories,
  getTaxCategory,
  createTaxCategory,
  deleteTaxCategory,
  listTaxRates,
  getTaxRate,
  createTaxRate,
  updateTaxRate,
  deleteTaxRate,
} from "../services/tax.js";
import { jsonContent } from "../output.js";
import { actionTool } from "./action-tool.js";

/** Registers the `vex_tax` MCP tool covering all tax category and rate operations. */
export function registerTaxTools(server: McpServer): void {
  actionTool(server, "vex_tax", "Manage Vendure tax categories and tax rates.", {
    list_categories: {
      summary: "List tax categories.",
      shape: {
        take: z.number().optional().describe("Number of results to return"),
        skip: z.number().optional().describe("Number of results to skip"),
      },
      handler: async (a) => jsonContent(await listTaxCategories(a as Parameters<typeof listTaxCategories>[0])),
    },
    get_category: {
      summary: "Get a tax category by ID.",
      shape: { id: z.string().describe("Tax category ID") },
      handler: async (a) => jsonContent(await getTaxCategory(a.id as string)),
    },
    create_category: {
      summary: "Create a new tax category (e.g. 'Standard', 'Reduced', 'Zero-rated').",
      shape: {
        name: z.string().describe("Tax category name"),
        isDefault: z.boolean().optional().describe("Set as the default tax category"),
      },
      handler: async (a) => jsonContent(await createTaxCategory(a as unknown as Parameters<typeof createTaxCategory>[0])),
    },
    delete_category: {
      summary: "Delete a tax category by ID.",
      shape: { id: z.string().describe("Tax category ID") },
      handler: async (a) => jsonContent(await deleteTaxCategory(a.id as string)),
    },
    list_rates: {
      summary: "List tax rates.",
      shape: {
        take: z.number().optional().describe("Number of results to return"),
        skip: z.number().optional().describe("Number of results to skip"),
      },
      handler: async (a) => jsonContent(await listTaxRates(a as Parameters<typeof listTaxRates>[0])),
    },
    get_rate: {
      summary: "Get a tax rate by ID.",
      shape: { id: z.string().describe("Tax rate ID") },
      handler: async (a) => jsonContent(await getTaxRate(a.id as string)),
    },
    create_rate: {
      summary: "Create a new tax rate linking a tax category to a zone with a percentage value.",
      shape: {
        name: z.string().describe("Tax rate name (e.g. 'GST 18%')"),
        value: z.number().describe("Tax rate percentage (e.g. 18 for 18%)"),
        categoryId: z.string().describe("Tax category ID"),
        zoneId: z.string().describe("Zone ID"),
        enabled: z.boolean().optional().describe("Whether the tax rate is enabled (default: true)"),
        customerGroupId: z.string().optional().describe("Optional customer group ID"),
      },
      handler: async (a) => jsonContent(await createTaxRate(a as unknown as Parameters<typeof createTaxRate>[0])),
    },
    update_rate: {
      summary: "Update an existing tax rate.",
      shape: {
        id: z.string().describe("Tax rate ID"),
        name: z.string().optional().describe("New tax rate name"),
        value: z.number().optional().describe("New tax rate percentage"),
        enabled: z.boolean().optional().describe("Enable or disable the tax rate"),
        categoryId: z.string().optional().describe("New tax category ID"),
        zoneId: z.string().optional().describe("New zone ID"),
        customerGroupId: z.string().optional().describe("New customer group ID"),
      },
      handler: async (a) => jsonContent(await updateTaxRate(a as unknown as Parameters<typeof updateTaxRate>[0])),
    },
    delete_rate: {
      summary: "Delete a tax rate by ID.",
      shape: { id: z.string().describe("Tax rate ID") },
      handler: async (a) => jsonContent(await deleteTaxRate(a.id as string)),
    },
  });
}

/** @module tools/tax — MCP tools for tax category and tax rate management. */

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
import { envAwareTool } from "./env-aware.js";

/** Registers all `vex_*_tax_*` MCP tools for tax category and rate operations. */
export function registerTaxTools(server: McpServer): void {
  envAwareTool(server,
    "vex_get_tax_categories",
    "List tax categories.",
    {
      take: z.number().optional().describe("Number of results to return"),
      skip: z.number().optional().describe("Number of results to skip"),
    },
    async (input) => jsonContent(await listTaxCategories(input))
  );

  envAwareTool(server,
    "vex_get_tax_category",
    "Get a tax category by ID.",
    { id: z.string().describe("Tax category ID") },
    async (input) => jsonContent(await getTaxCategory(input.id))
  );

  envAwareTool(server,
    "vex_create_tax_category",
    "Create a new tax category (e.g. 'Standard', 'Reduced', 'Zero-rated').",
    {
      name: z.string().describe("Tax category name"),
      isDefault: z.boolean().optional().describe("Set as the default tax category"),
    },
    async (input) => jsonContent(await createTaxCategory(input))
  );

  envAwareTool(server,
    "vex_delete_tax_category",
    "Delete a tax category by ID.",
    { id: z.string().describe("Tax category ID") },
    async (input) => jsonContent(await deleteTaxCategory(input.id))
  );

  envAwareTool(server,
    "vex_get_tax_rates",
    "List tax rates.",
    {
      take: z.number().optional().describe("Number of results to return"),
      skip: z.number().optional().describe("Number of results to skip"),
    },
    async (input) => jsonContent(await listTaxRates(input))
  );

  envAwareTool(server,
    "vex_get_tax_rate",
    "Get a tax rate by ID.",
    { id: z.string().describe("Tax rate ID") },
    async (input) => jsonContent(await getTaxRate(input.id))
  );

  envAwareTool(server,
    "vex_create_tax_rate",
    "Create a new tax rate. Links a tax category to a zone with a percentage value.",
    {
      name: z.string().describe("Tax rate name (e.g. 'GST 18%')"),
      value: z.number().describe("Tax rate percentage (e.g. 18 for 18%)"),
      categoryId: z.string().describe("Tax category ID"),
      zoneId: z.string().describe("Zone ID"),
      enabled: z.boolean().optional().describe("Whether the tax rate is enabled (default: true)"),
      customerGroupId: z.string().optional().describe("Optional customer group ID"),
    },
    async (input) => jsonContent(await createTaxRate(input))
  );

  envAwareTool(server,
    "vex_update_tax_rate",
    "Update an existing tax rate.",
    {
      id: z.string().describe("Tax rate ID"),
      name: z.string().optional().describe("New tax rate name"),
      value: z.number().optional().describe("New tax rate percentage"),
      enabled: z.boolean().optional().describe("Enable or disable the tax rate"),
      categoryId: z.string().optional().describe("New tax category ID"),
      zoneId: z.string().optional().describe("New zone ID"),
      customerGroupId: z.string().optional().describe("New customer group ID"),
    },
    async (input) => jsonContent(await updateTaxRate(input))
  );

  envAwareTool(server,
    "vex_delete_tax_rate",
    "Delete a tax rate by ID.",
    { id: z.string().describe("Tax rate ID") },
    async (input) => jsonContent(await deleteTaxRate(input.id))
  );
}

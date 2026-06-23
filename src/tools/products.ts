/** @module tools/products — MCP tools for product management (list, get, create, update, delete, create-variants). */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  createProductVariants,
} from "../services/products.js";
import { jsonContent } from "../output.js";
import { envAwareTool } from "./env-aware.js";

/** Registers all `vex_*_product*` MCP tools for product operations. */
export function registerProductTools(server: McpServer): void {
  envAwareTool(server,
    "vex_get_products",
    "List products with optional filters.",
    {
      take: z.number().optional().describe("Number of results to return"),
      skip: z.number().optional().describe("Number of results to skip"),
      filterByName: z.string().optional().describe("Filter by product name (contains)"),
    },
    async (input) => jsonContent(await listProducts(input))
  );

  envAwareTool(server,
    "vex_get_product",
    "Get a single product by ID with variants, options, and facet values.",
    { id: z.string().describe("Product ID") },
    async (input) => jsonContent(await getProduct(input.id))
  );

  envAwareTool(server,
    "vex_create_product",
    "Create a new product.",
    {
      name: z.string().describe("Product name"),
      slug: z.string().describe("URL-friendly slug"),
      description: z.string().describe("Product description"),
      facetValueIds: z.array(z.string()).optional().describe("Facet value IDs to assign"),
    },
    async (input) => jsonContent(await createProduct(input))
  );

  envAwareTool(server,
    "vex_update_product",
    "Update an existing product.",
    {
      id: z.string().describe("Product ID"),
      name: z.string().optional().describe("New product name"),
      slug: z.string().optional().describe("New slug"),
      description: z.string().optional().describe("New description"),
      enabled: z.boolean().optional().describe("Enable or disable the product"),
    },
    async (input) => jsonContent(await updateProduct(input))
  );

  envAwareTool(server,
    "vex_delete_product",
    "Delete a product by ID.",
    { id: z.string().describe("Product ID") },
    async (input) => jsonContent(await deleteProduct(input.id))
  );

  envAwareTool(server,
    "vex_create_product_variants",
    "Create variants for an existing product.",
    {
      productId: z.string().describe("Product ID to create variants for"),
      variants: z.array(
        z.object({
          name: z.string().describe("Variant name"),
          sku: z.string().describe("SKU code"),
          price: z.number().describe("Price in minor units (cents)"),
          stockOnHand: z.number().optional().describe("Initial stock quantity"),
        })
      ).describe("Array of variants to create"),
    },
    async (input) => jsonContent(await createProductVariants(input))
  );
}

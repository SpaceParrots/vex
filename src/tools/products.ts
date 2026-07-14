/** @module tools/products — `vex_products` action-dispatch MCP tool (list, get, create, update, delete, create_variants). */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  createProductVariants,
  type ProductListInput,
  type CreateProductInput,
  type UpdateProductInput,
  type CreateProductVariantsInput,
} from "../services/products.js";
import { jsonContent } from "../output.js";
import { actionTool } from "./action-tool.js";

/** Registers the `vex_products` MCP tool covering all product operations. */
export function registerProductTools(server: McpServer): void {
  actionTool(server, "vex_products", "Manage Vendure products and their variants.", {
    list: {
      summary: "List products with optional name filter (variant detail omitted; use get for it).",
      shape: {
        take: z.number().optional().describe("Items per page (default 20)."),
        skip: z.number().optional().describe("Items to skip (default 0)."),
        filterByName: z.string().optional().describe("Filter by product name (contains)"),
      },
      handler: async (a) => jsonContent(await listProducts(a as ProductListInput)),
    },
    get: {
      summary: "Get a single product by ID with variants, options, and facet values.",
      shape: { id: z.string().describe("Product ID") },
      handler: async (a) => jsonContent(await getProduct(a.id as string)),
    },
    create: {
      summary: "Create a new product.",
      shape: {
        name: z.string().describe("Product name"),
        slug: z.string().describe("URL-friendly slug"),
        description: z.string().describe("Product description"),
        facetValueIds: z.array(z.string()).optional().describe("Facet value IDs to assign"),
      },
      handler: async (a) => jsonContent(await createProduct(a as unknown as CreateProductInput)),
    },
    update: {
      summary: "Update an existing product.",
      shape: {
        id: z.string().describe("Product ID"),
        name: z.string().optional().describe("New product name"),
        slug: z.string().optional().describe("New slug"),
        description: z.string().optional().describe("New description"),
        enabled: z.boolean().optional().describe("Enable or disable the product"),
      },
      handler: async (a) => jsonContent(await updateProduct(a as unknown as UpdateProductInput)),
    },
    delete: {
      summary: "Delete a product by ID.",
      shape: { id: z.string().describe("Product ID") },
      handler: async (a) => jsonContent(await deleteProduct(a.id as string)),
    },
    create_variants: {
      summary: "Create variants for an existing product.",
      shape: {
        productId: z.string().describe("Product ID to create variants for"),
        variants: z
          .array(
            z.object({
              name: z.string().describe("Variant name"),
              sku: z.string().describe("SKU code"),
              price: z.number().describe("Price in minor units (cents)"),
              stockOnHand: z.number().optional().describe("Initial stock quantity"),
            })
          )
          .describe("Array of variants to create"),
      },
      handler: async (a) => jsonContent(await createProductVariants(a as unknown as CreateProductVariantsInput)),
    },
  });
}

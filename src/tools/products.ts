import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getActiveEnv } from "../config.js";
import { createClient } from "../client.js";

export function registerProductTools(server: McpServer): void {
  server.tool(
    "vendure_get_products",
    "List products with optional filters.",
    {
      take: z.number().optional().describe("Number of results to return"),
      skip: z.number().optional().describe("Number of results to skip"),
      filterByName: z.string().optional().describe("Filter by product name (contains)"),
    },
    async (input) => {
      const { env } = await getActiveEnv();
      const client = createClient(env);

      const filter: Record<string, unknown> = {};
      if (input.filterByName) {
        filter.name = { contains: input.filterByName };
      }

      const data = await client.request(
        `query GetProducts($options: ProductListOptions) {
          products(options: $options) {
            items {
              id
              name
              slug
              enabled
              createdAt
              updatedAt
              featuredAsset { preview }
              variants {
                id
                name
                sku
                price
                stockOnHand
              }
            }
            totalItems
          }
        }`,
        {
          options: {
            take: input.take ?? 20,
            skip: input.skip ?? 0,
            ...(Object.keys(filter).length > 0 && { filter }),
          },
        }
      );

      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "vendure_get_product",
    "Get a single product by ID with variants, options, and facet values.",
    {
      id: z.string().describe("Product ID"),
    },
    async (input) => {
      const { env } = await getActiveEnv();
      const client = createClient(env);

      const data = await client.request(
        `query GetProduct($id: ID!) {
          product(id: $id) {
            id
            name
            slug
            description
            enabled
            createdAt
            updatedAt
            featuredAsset { preview }
            assets { id preview source }
            optionGroups {
              id
              name
              code
              options { id name code }
            }
            facetValues {
              id
              name
              code
              facet { id name code }
            }
            variants {
              id
              name
              sku
              price
              priceWithTax
              stockOnHand
              enabled
              options { id name code group { name } }
              facetValues { id name code }
              assets { id preview }
            }
          }
        }`,
        { id: input.id }
      );

      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "vendure_create_product",
    "Create a new product.",
    {
      name: z.string().describe("Product name"),
      slug: z.string().describe("URL-friendly slug"),
      description: z.string().describe("Product description"),
      facetValueIds: z
        .array(z.string())
        .optional()
        .describe("Facet value IDs to assign"),
    },
    async (input) => {
      const { env } = await getActiveEnv();
      const client = createClient(env);

      const data = await client.request(
        `mutation CreateProduct($input: CreateProductInput!) {
          createProduct(input: $input) {
            id
            name
            slug
            description
          }
        }`,
        {
          input: {
            translations: [
              {
                languageCode: "en",
                name: input.name,
                slug: input.slug,
                description: input.description,
              },
            ],
            ...(input.facetValueIds && { facetValueIds: input.facetValueIds }),
          },
        }
      );

      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "vendure_update_product",
    "Update an existing product.",
    {
      id: z.string().describe("Product ID"),
      name: z.string().optional().describe("New product name"),
      slug: z.string().optional().describe("New slug"),
      description: z.string().optional().describe("New description"),
      enabled: z.boolean().optional().describe("Enable or disable the product"),
    },
    async (input) => {
      const { env } = await getActiveEnv();
      const client = createClient(env);

      const translations: Record<string, string> = { languageCode: "en" };
      if (input.name !== undefined) translations.name = input.name;
      if (input.slug !== undefined) translations.slug = input.slug;
      if (input.description !== undefined)
        translations.description = input.description;

      const updateInput: Record<string, unknown> = { id: input.id };
      if (Object.keys(translations).length > 1) {
        updateInput.translations = [translations];
      }
      if (input.enabled !== undefined) {
        updateInput.enabled = input.enabled;
      }

      const data = await client.request(
        `mutation UpdateProduct($input: UpdateProductInput!) {
          updateProduct(input: $input) {
            id
            name
            slug
            description
            enabled
          }
        }`,
        { input: updateInput }
      );

      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "vendure_delete_product",
    "Delete a product by ID.",
    {
      id: z.string().describe("Product ID"),
    },
    async (input) => {
      const { env } = await getActiveEnv();
      const client = createClient(env);

      const data = await client.request(
        `mutation DeleteProduct($id: ID!) {
          deleteProduct(id: $id) {
            result
            message
          }
        }`,
        { id: input.id }
      );

      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "vendure_create_product_variants",
    "Create variants for an existing product.",
    {
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
    async (input) => {
      const { env } = await getActiveEnv();
      const client = createClient(env);

      const data = await client.request(
        `mutation CreateProductVariants($input: [CreateProductVariantInput!]!) {
          createProductVariants(input: $input) {
            ... on ProductVariant {
              id
              name
              sku
              price
              stockOnHand
            }
            ... on ErrorResult {
              errorCode
              message
            }
          }
        }`,
        {
          input: input.variants.map((v) => ({
            productId: input.productId,
            sku: v.sku,
            price: v.price,
            translations: [{ languageCode: "en", name: v.name }],
            ...(v.stockOnHand !== undefined && { stockOnHand: v.stockOnHand }),
          })),
        }
      );

      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    }
  );
}

/**
 * @module services/products
 *
 * Product catalog operations for the Vendure Admin API.
 * Supports listing, creating, updating, deleting products, and creating variants.
 */

import { getClient } from "../client.js";
import { DEFAULT_PAGE_SIZE, DEFAULT_SKIP, DEFAULT_LANGUAGE_CODE } from "../constants.js";

/** Options for filtering and paginating the product list. */
export interface ProductListInput {
  readonly take?: number;
  readonly skip?: number;
  readonly filterByName?: string;
}

/**
 * Lists products with optional name filter and pagination. Returns lightweight
 * rows only (no variant detail) to keep MCP responses small; use {@link getProduct}
 * for a product's full variants, options, facets, and assets.
 */
export async function listProducts(input: ProductListInput): Promise<unknown> {
  const client = await getClient();

  const filter: Record<string, unknown> = {};
  if (input.filterByName) {
    filter.name = { contains: input.filterByName };
  }

  return client.request(
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
        }
        totalItems
      }
    }`,
    {
      options: {
        take: input.take ?? DEFAULT_PAGE_SIZE,
        skip: input.skip ?? DEFAULT_SKIP,
        ...(Object.keys(filter).length > 0 && { filter }),
      },
    }
  );
}

/** Retrieves a single product by ID, including its variants, option groups, facet values, and assets. */
export async function getProduct(id: string): Promise<unknown> {
  const client = await getClient();

  return client.request(
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
    { id }
  );
}

/** Input fields for creating a new product. */
export interface CreateProductInput {
  readonly name: string;
  readonly slug: string;
  readonly description: string;
  readonly facetValueIds?: readonly string[];
}

/**
 * Creates a new product. Uses {@link DEFAULT_LANGUAGE_CODE} for the translation entry
 * wrapping name, slug, and description.
 */
export async function createProduct(input: CreateProductInput): Promise<unknown> {
  const client = await getClient();

  return client.request(
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
            languageCode: DEFAULT_LANGUAGE_CODE,
            name: input.name,
            slug: input.slug,
            description: input.description,
          },
        ],
        ...(input.facetValueIds && { facetValueIds: input.facetValueIds }),
      },
    }
  );
}

/** Input fields for updating an existing product. All fields except `id` are optional. */
export interface UpdateProductInput {
  readonly id: string;
  readonly name?: string;
  readonly slug?: string;
  readonly description?: string;
  readonly enabled?: boolean;
}

/**
 * Updates an existing product. Only provided fields are sent to the API.
 * Uses {@link DEFAULT_LANGUAGE_CODE} for the translation entry when name, slug,
 * or description are changed.
 */
export async function updateProduct(input: UpdateProductInput): Promise<unknown> {
  const client = await getClient();

  const translations: Record<string, string> = { languageCode: DEFAULT_LANGUAGE_CODE };
  if (input.name !== undefined) translations.name = input.name;
  if (input.slug !== undefined) translations.slug = input.slug;
  if (input.description !== undefined) translations.description = input.description;

  const updateInput: Record<string, unknown> = { id: input.id };
  if (Object.keys(translations).length > 1) {
    updateInput.translations = [translations];
  }
  if (input.enabled !== undefined) {
    updateInput.enabled = input.enabled;
  }

  return client.request(
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
}

/** Deletes a product by ID. Returns the deletion result and an optional message. */
export async function deleteProduct(id: string): Promise<unknown> {
  const client = await getClient();

  return client.request(
    `mutation DeleteProduct($id: ID!) {
      deleteProduct(id: $id) {
        result
        message
      }
    }`,
    { id }
  );
}

/** Shape of a single variant within a {@link CreateProductVariantsInput} batch. */
export interface VariantInput {
  readonly name: string;
  readonly sku: string;
  readonly price: number;
  readonly stockOnHand?: number;
}

/** Input for creating one or more variants on a product. */
export interface CreateProductVariantsInput {
  readonly productId: string;
  readonly variants: readonly VariantInput[];
}

/**
 * Creates one or more variants for a product. Each variant receives a translation
 * entry using {@link DEFAULT_LANGUAGE_CODE}. Returns a union of `ProductVariant`
 * or `ErrorResult` per variant (Vendure union return type).
 */
export async function createProductVariants(input: CreateProductVariantsInput): Promise<unknown> {
  const client = await getClient();

  return client.request(
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
        translations: [{ languageCode: DEFAULT_LANGUAGE_CODE, name: v.name }],
        ...(v.stockOnHand !== undefined && { stockOnHand: v.stockOnHand }),
      })),
    }
  );
}

import { getActiveEnv } from "../config.js";
import { createClient } from "../client.js";

export interface ProductListInput {
  readonly take?: number;
  readonly skip?: number;
  readonly filterByName?: string;
}

export async function listProducts(input: ProductListInput): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

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
}

export async function getProduct(id: string): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

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

export interface CreateProductInput {
  readonly name: string;
  readonly slug: string;
  readonly description: string;
  readonly facetValueIds?: readonly string[];
}

export async function createProduct(input: CreateProductInput): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

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
}

export interface UpdateProductInput {
  readonly id: string;
  readonly name?: string;
  readonly slug?: string;
  readonly description?: string;
  readonly enabled?: boolean;
}

export async function updateProduct(input: UpdateProductInput): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

  const translations: Record<string, string> = { languageCode: "en" };
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

export async function deleteProduct(id: string): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

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

export interface VariantInput {
  readonly name: string;
  readonly sku: string;
  readonly price: number;
  readonly stockOnHand?: number;
}

export interface CreateProductVariantsInput {
  readonly productId: string;
  readonly variants: readonly VariantInput[];
}

export async function createProductVariants(input: CreateProductVariantsInput): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

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
        translations: [{ languageCode: "en", name: v.name }],
        ...(v.stockOnHand !== undefined && { stockOnHand: v.stockOnHand }),
      })),
    }
  );
}

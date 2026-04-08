/**
 * @module services/tax
 *
 * Tax category and tax rate operations for the Vendure Admin API.
 * Tax categories classify products (e.g. "Standard", "Reduced", "Zero-rated").
 * Tax rates link a category to a zone with a percentage value.
 */

import { getClient } from "../client.js";
import { DEFAULT_PAGE_SIZE, DEFAULT_SKIP } from "../constants.js";

/** Pagination options for listing tax categories. */
export interface TaxCategoryListInput {
  readonly take?: number;
  readonly skip?: number;
}

/** Lists tax categories with pagination. */
export async function listTaxCategories(input: TaxCategoryListInput): Promise<unknown> {
  const client = await getClient();

  return client.request(
    `query GetTaxCategories($options: TaxCategoryListOptions) {
      taxCategories(options: $options) {
        items {
          id
          name
          isDefault
          createdAt
          updatedAt
        }
        totalItems
      }
    }`,
    {
      options: {
        take: input.take ?? DEFAULT_PAGE_SIZE,
        skip: input.skip ?? DEFAULT_SKIP,
      },
    }
  );
}

/** Retrieves a single tax category by ID. */
export async function getTaxCategory(id: string): Promise<unknown> {
  const client = await getClient();

  return client.request(
    `query GetTaxCategory($id: ID!) {
      taxCategory(id: $id) {
        id
        name
        isDefault
        createdAt
        updatedAt
      }
    }`,
    { id }
  );
}

/** Input for creating a new tax category. */
export interface CreateTaxCategoryInput {
  readonly name: string;
  readonly isDefault?: boolean;
}

/** Creates a new tax category with an optional `isDefault` flag. */
export async function createTaxCategory(input: CreateTaxCategoryInput): Promise<unknown> {
  const client = await getClient();

  return client.request(
    `mutation CreateTaxCategory($input: CreateTaxCategoryInput!) {
      createTaxCategory(input: $input) {
        id
        name
        isDefault
      }
    }`,
    {
      input: {
        name: input.name,
        ...(input.isDefault !== undefined && { isDefault: input.isDefault }),
      },
    }
  );
}

/** Deletes a tax category by ID. */
export async function deleteTaxCategory(id: string): Promise<unknown> {
  const client = await getClient();

  return client.request(
    `mutation DeleteTaxCategory($id: ID!) {
      deleteTaxCategory(id: $id) {
        result
        message
      }
    }`,
    { id }
  );
}

/** Pagination options for listing tax rates. */
export interface TaxRateListInput {
  readonly take?: number;
  readonly skip?: number;
}

/** Lists tax rates with their linked category, zone, and customer group. */
export async function listTaxRates(input: TaxRateListInput): Promise<unknown> {
  const client = await getClient();

  return client.request(
    `query GetTaxRates($options: TaxRateListOptions) {
      taxRates(options: $options) {
        items {
          id
          name
          enabled
          value
          createdAt
          updatedAt
          category { id name }
          zone { id name }
          customerGroup { id name }
        }
        totalItems
      }
    }`,
    {
      options: {
        take: input.take ?? DEFAULT_PAGE_SIZE,
        skip: input.skip ?? DEFAULT_SKIP,
      },
    }
  );
}

/** Retrieves a single tax rate by ID with its category, zone, and customer group. */
export async function getTaxRate(id: string): Promise<unknown> {
  const client = await getClient();

  return client.request(
    `query GetTaxRate($id: ID!) {
      taxRate(id: $id) {
        id
        name
        enabled
        value
        createdAt
        updatedAt
        category { id name }
        zone { id name }
        customerGroup { id name }
      }
    }`,
    { id }
  );
}

/** Input for creating a new tax rate linking a category to a zone. */
export interface CreateTaxRateInput {
  readonly name: string;
  readonly value: number;
  readonly categoryId: string;
  readonly zoneId: string;
  readonly enabled?: boolean;
  readonly customerGroupId?: string;
}

/** Creates a tax rate. Defaults to enabled so it takes effect immediately. */
export async function createTaxRate(input: CreateTaxRateInput): Promise<unknown> {
  const client = await getClient();

  return client.request(
    `mutation CreateTaxRate($input: CreateTaxRateInput!) {
      createTaxRate(input: $input) {
        id
        name
        enabled
        value
        category { id name }
        zone { id name }
        customerGroup { id name }
      }
    }`,
    {
      input: {
        name: input.name,
        value: input.value,
        categoryId: input.categoryId,
        zoneId: input.zoneId,
        // Tax rates are enabled by default so they take effect immediately
        enabled: input.enabled ?? true,
        ...(input.customerGroupId && { customerGroupId: input.customerGroupId }),
      },
    }
  );
}

/** Input for updating a tax rate. Only provided fields are changed. */
export interface UpdateTaxRateInput {
  readonly id: string;
  readonly name?: string;
  readonly value?: number;
  readonly enabled?: boolean;
  readonly categoryId?: string;
  readonly zoneId?: string;
  readonly customerGroupId?: string;
}

/** Updates an existing tax rate. Only defined fields in the input are sent. */
export async function updateTaxRate(input: UpdateTaxRateInput): Promise<unknown> {
  const client = await getClient();

  const { id, ...fields } = input;
  const updateInput: Record<string, unknown> = { id };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      updateInput[key] = value;
    }
  }

  return client.request(
    `mutation UpdateTaxRate($input: UpdateTaxRateInput!) {
      updateTaxRate(input: $input) {
        id
        name
        enabled
        value
        category { id name }
        zone { id name }
        customerGroup { id name }
      }
    }`,
    { input: updateInput }
  );
}

/** Deletes a tax rate by ID. */
export async function deleteTaxRate(id: string): Promise<unknown> {
  const client = await getClient();

  return client.request(
    `mutation DeleteTaxRate($id: ID!) {
      deleteTaxRate(id: $id) {
        result
        message
      }
    }`,
    { id }
  );
}

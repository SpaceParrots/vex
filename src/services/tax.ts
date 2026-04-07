import { getActiveEnv } from "../config.js";
import { createClient } from "../client.js";

export interface TaxCategoryListInput {
  readonly take?: number;
  readonly skip?: number;
}

export async function listTaxCategories(input: TaxCategoryListInput): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

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
        take: input.take ?? 20,
        skip: input.skip ?? 0,
      },
    }
  );
}

export async function getTaxCategory(id: string): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

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

export interface CreateTaxCategoryInput {
  readonly name: string;
  readonly isDefault?: boolean;
}

export async function createTaxCategory(input: CreateTaxCategoryInput): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

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

export async function deleteTaxCategory(id: string): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

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

export interface TaxRateListInput {
  readonly take?: number;
  readonly skip?: number;
}

export async function listTaxRates(input: TaxRateListInput): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

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
        take: input.take ?? 20,
        skip: input.skip ?? 0,
      },
    }
  );
}

export async function getTaxRate(id: string): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

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

export interface CreateTaxRateInput {
  readonly name: string;
  readonly value: number;
  readonly categoryId: string;
  readonly zoneId: string;
  readonly enabled?: boolean;
  readonly customerGroupId?: string;
}

export async function createTaxRate(input: CreateTaxRateInput): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

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
        enabled: input.enabled ?? true,
        ...(input.customerGroupId && { customerGroupId: input.customerGroupId }),
      },
    }
  );
}

export interface UpdateTaxRateInput {
  readonly id: string;
  readonly name?: string;
  readonly value?: number;
  readonly enabled?: boolean;
  readonly categoryId?: string;
  readonly zoneId?: string;
  readonly customerGroupId?: string;
}

export async function updateTaxRate(input: UpdateTaxRateInput): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

  const updateInput: Record<string, unknown> = { id: input.id };
  if (input.name !== undefined) updateInput.name = input.name;
  if (input.value !== undefined) updateInput.value = input.value;
  if (input.enabled !== undefined) updateInput.enabled = input.enabled;
  if (input.categoryId !== undefined) updateInput.categoryId = input.categoryId;
  if (input.zoneId !== undefined) updateInput.zoneId = input.zoneId;
  if (input.customerGroupId !== undefined) updateInput.customerGroupId = input.customerGroupId;

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

export async function deleteTaxRate(id: string): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

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

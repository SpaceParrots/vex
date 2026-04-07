import { getActiveEnv } from "../config.js";
import { createClient } from "../client.js";

export interface CustomerListInput {
  readonly take?: number;
  readonly skip?: number;
  readonly filterByEmail?: string;
  readonly filterByName?: string;
}

export async function listCustomers(input: CustomerListInput): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

  const filter: Record<string, unknown> = {};
  if (input.filterByEmail) {
    filter.emailAddress = { contains: input.filterByEmail };
  }
  if (input.filterByName) {
    filter.lastName = { contains: input.filterByName };
  }

  return client.request(
    `query GetCustomers($options: CustomerListOptions) {
      customers(options: $options) {
        items {
          id
          firstName
          lastName
          emailAddress
          phoneNumber
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
        ...(Object.keys(filter).length > 0 && { filter }),
      },
    }
  );
}

export async function getCustomer(id: string): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

  return client.request(
    `query GetCustomer($id: ID!) {
      customer(id: $id) {
        id
        firstName
        lastName
        emailAddress
        phoneNumber
        title
        createdAt
        updatedAt
        addresses {
          id
          fullName
          streetLine1
          streetLine2
          city
          province
          postalCode
          country { code name }
          defaultShippingAddress
          defaultBillingAddress
        }
        orders {
          items {
            id
            code
            state
            total
            createdAt
          }
          totalItems
        }
      }
    }`,
    { id }
  );
}

export interface CreateCustomerInput {
  readonly emailAddress: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly phoneNumber?: string;
  readonly title?: string;
}

export async function createCustomer(input: CreateCustomerInput): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

  return client.request(
    `mutation CreateCustomer($input: CreateCustomerInput!) {
      createCustomer(input: $input) {
        ... on Customer {
          id
          firstName
          lastName
          emailAddress
          phoneNumber
        }
        ... on ErrorResult {
          errorCode
          message
        }
      }
    }`,
    {
      input: {
        emailAddress: input.emailAddress,
        firstName: input.firstName,
        lastName: input.lastName,
        ...(input.phoneNumber && { phoneNumber: input.phoneNumber }),
        ...(input.title && { title: input.title }),
      },
    }
  );
}

export interface UpdateCustomerInput {
  readonly id: string;
  readonly emailAddress?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly phoneNumber?: string;
}

export async function updateCustomer(input: UpdateCustomerInput): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

  const { id, ...fields } = input;
  const updateInput: Record<string, unknown> = { id };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      updateInput[key] = value;
    }
  }

  return client.request(
    `mutation UpdateCustomer($input: UpdateCustomerInput!) {
      updateCustomer(input: $input) {
        ... on Customer {
          id
          firstName
          lastName
          emailAddress
          phoneNumber
        }
        ... on ErrorResult {
          errorCode
          message
        }
      }
    }`,
    { input: updateInput }
  );
}

export async function deleteCustomer(id: string): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

  return client.request(
    `mutation DeleteCustomer($id: ID!) {
      deleteCustomer(id: $id) {
        result
        message
      }
    }`,
    { id }
  );
}

export interface AddCustomerNoteInput {
  readonly id: string;
  readonly note: string;
  readonly isPublic?: boolean;
}

export async function addCustomerNote(input: AddCustomerNoteInput): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

  return client.request(
    `mutation AddNoteToCustomer($input: AddNoteToCustomerInput!) {
      addNoteToCustomer(input: $input) {
        id
      }
    }`,
    {
      input: {
        id: input.id,
        note: input.note,
        isPublic: input.isPublic ?? false,
      },
    }
  );
}

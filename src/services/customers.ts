/**
 * @module services/customers
 *
 * Customer management operations for the Vendure Admin API.
 * Supports listing, creating, updating, deleting customers, and adding notes.
 */

import { getClient } from "../client.js";
import { DEFAULT_PAGE_SIZE, DEFAULT_SKIP } from "../constants.js";

/** Options for listing customers with optional email/name filters. */
export interface CustomerListInput {
  readonly take?: number;
  readonly skip?: number;
  readonly filterByEmail?: string;
  readonly filterByName?: string;
}

/** Lists customers with optional email and last-name filters. */
export async function listCustomers(input: CustomerListInput): Promise<unknown> {
  const client = await getClient();

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
        take: input.take ?? DEFAULT_PAGE_SIZE,
        skip: input.skip ?? DEFAULT_SKIP,
        ...(Object.keys(filter).length > 0 && { filter }),
      },
    }
  );
}

/** Retrieves a single customer by ID with addresses and order history. */
export async function getCustomer(id: string): Promise<unknown> {
  const client = await getClient();

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

/** Input for creating a new customer. */
export interface CreateCustomerInput {
  readonly emailAddress: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly phoneNumber?: string;
  readonly title?: string;
}

/** Creates a new customer. Returns the customer or an ErrorResult. */
export async function createCustomer(input: CreateCustomerInput): Promise<unknown> {
  const client = await getClient();

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

/** Input for updating an existing customer. Only provided fields are changed. */
export interface UpdateCustomerInput {
  readonly id: string;
  readonly emailAddress?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly phoneNumber?: string;
}

/** Updates an existing customer. Only defined fields in the input are sent. */
export async function updateCustomer(input: UpdateCustomerInput): Promise<unknown> {
  const client = await getClient();

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

/** Deletes a customer by ID. */
export async function deleteCustomer(id: string): Promise<unknown> {
  const client = await getClient();

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

/** Input for adding a note to a customer. */
export interface AddCustomerNoteInput {
  readonly id: string;
  readonly note: string;
  readonly isPublic?: boolean;
}

/** Adds a note to a customer. Notes default to private (`isPublic: false`). */
export async function addCustomerNote(input: AddCustomerNoteInput): Promise<unknown> {
  const client = await getClient();

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
        // Notes are private by default — only visible to admins unless explicitly shared
        isPublic: input.isPublic ?? false,
      },
    }
  );
}

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getActiveEnv } from "../config.js";
import { createClient } from "../client.js";

export function registerCustomerTools(server: McpServer): void {
  server.tool(
    "vendure_get_customers",
    "List customers with optional filters.",
    {
      take: z.number().optional().describe("Number of results to return"),
      skip: z.number().optional().describe("Number of results to skip"),
      filterByEmail: z.string().optional().describe("Filter by email (contains)"),
      filterByName: z.string().optional().describe("Filter by first or last name (contains)"),
    },
    async (input) => {
      const { env } = await getActiveEnv();
      const client = createClient(env);

      const filter: Record<string, unknown> = {};
      if (input.filterByEmail) {
        filter.emailAddress = { contains: input.filterByEmail };
      }
      if (input.filterByName) {
        filter.lastName = { contains: input.filterByName };
      }

      const data = await client.request(
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

      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "vendure_get_customer",
    "Get a single customer by ID with full details.",
    {
      id: z.string().describe("Customer ID"),
    },
    async (input) => {
      const { env } = await getActiveEnv();
      const client = createClient(env);

      const data = await client.request(
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
        { id: input.id }
      );

      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "vendure_create_customer",
    "Create a new customer.",
    {
      emailAddress: z.string().describe("Customer email address"),
      firstName: z.string().describe("First name"),
      lastName: z.string().describe("Last name"),
      phoneNumber: z.string().optional().describe("Phone number"),
      title: z.string().optional().describe("Title (Mr, Mrs, etc.)"),
    },
    async (input) => {
      const { env } = await getActiveEnv();
      const client = createClient(env);

      const data = await client.request(
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

      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "vendure_update_customer",
    "Update an existing customer.",
    {
      id: z.string().describe("Customer ID"),
      emailAddress: z.string().optional().describe("New email address"),
      firstName: z.string().optional().describe("New first name"),
      lastName: z.string().optional().describe("New last name"),
      phoneNumber: z.string().optional().describe("New phone number"),
    },
    async (input) => {
      const { env } = await getActiveEnv();
      const client = createClient(env);

      const { id, ...fields } = input;
      const updateInput: Record<string, unknown> = { id };
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) {
          updateInput[key] = value;
        }
      }

      const data = await client.request(
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

      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "vendure_delete_customer",
    "Delete a customer by ID.",
    {
      id: z.string().describe("Customer ID"),
    },
    async (input) => {
      const { env } = await getActiveEnv();
      const client = createClient(env);

      const data = await client.request(
        `mutation DeleteCustomer($id: ID!) {
          deleteCustomer(id: $id) {
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
    "vendure_add_customer_note",
    "Add a note to a customer.",
    {
      id: z.string().describe("Customer ID"),
      note: z.string().describe("Note content"),
      isPublic: z.boolean().optional().describe("Whether the note is public (default: false)"),
    },
    async (input) => {
      const { env } = await getActiveEnv();
      const client = createClient(env);

      const data = await client.request(
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

      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    }
  );
}

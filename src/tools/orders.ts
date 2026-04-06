import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getActiveEnv } from "../config.js";
import { createClient } from "../client.js";

export function registerOrderTools(server: McpServer): void {
  server.tool(
    "vendure_get_orders",
    "List orders with optional filters.",
    {
      take: z.number().optional().describe("Number of results to return"),
      skip: z.number().optional().describe("Number of results to skip"),
      filterByCode: z.string().optional().describe("Filter by order code (contains)"),
    },
    async (input) => {
      const { env } = await getActiveEnv();
      const client = createClient(env);

      const filter: Record<string, unknown> = {};
      if (input.filterByCode) {
        filter.code = { contains: input.filterByCode };
      }

      const data = await client.request(
        `query GetOrders($options: OrderListOptions) {
          orders(options: $options) {
            items {
              id
              code
              state
              total
              totalWithTax
              currencyCode
              orderPlacedAt
              createdAt
              customer {
                id
                firstName
                lastName
                emailAddress
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
    "vendure_get_order",
    "Get a single order by ID with full details.",
    {
      id: z.string().describe("Order ID"),
    },
    async (input) => {
      const { env } = await getActiveEnv();
      const client = createClient(env);

      const data = await client.request(
        `query GetOrder($id: ID!) {
          order(id: $id) {
            id
            code
            state
            total
            totalWithTax
            subTotal
            subTotalWithTax
            shipping
            shippingWithTax
            currencyCode
            orderPlacedAt
            createdAt
            updatedAt
            customer {
              id
              firstName
              lastName
              emailAddress
            }
            lines {
              id
              quantity
              unitPrice
              unitPriceWithTax
              linePrice
              linePriceWithTax
              productVariant {
                id
                name
                sku
              }
            }
            shippingLines {
              shippingMethod { id name }
              price
              priceWithTax
            }
            payments {
              id
              method
              amount
              state
              transactionId
              createdAt
            }
            fulfillments {
              id
              state
              method
              trackingCode
              createdAt
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
    "vendure_create_draft_order",
    "Create a new draft order.",
    {},
    async () => {
      const { env } = await getActiveEnv();
      const client = createClient(env);

      const data = await client.request(
        `mutation CreateDraftOrder {
          createDraftOrder {
            id
            code
            state
          }
        }`
      );

      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "vendure_add_item_to_draft_order",
    "Add a product variant to a draft order.",
    {
      orderId: z.string().describe("Draft order ID"),
      productVariantId: z.string().describe("Product variant ID to add"),
      quantity: z.number().describe("Quantity to add"),
    },
    async (input) => {
      const { env } = await getActiveEnv();
      const client = createClient(env);

      const data = await client.request(
        `mutation AddItemToDraftOrder($orderId: ID!, $input: AddItemToDraftOrderInput!) {
          addItemToDraftOrder(orderId: $orderId, input: $input) {
            ... on Order {
              id
              code
              state
              total
              lines {
                id
                quantity
                productVariant { id name sku }
                linePrice
              }
            }
            ... on ErrorResult {
              errorCode
              message
            }
          }
        }`,
        {
          orderId: input.orderId,
          input: {
            productVariantId: input.productVariantId,
            quantity: input.quantity,
          },
        }
      );

      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "vendure_set_customer_for_draft_order",
    "Set the customer for a draft order.",
    {
      orderId: z.string().describe("Draft order ID"),
      customerId: z.string().describe("Customer ID to assign"),
    },
    async (input) => {
      const { env } = await getActiveEnv();
      const client = createClient(env);

      const data = await client.request(
        `mutation SetCustomerForDraftOrder($orderId: ID!, $customerId: ID!) {
          setCustomerForDraftOrder(orderId: $orderId, customerId: $customerId) {
            ... on Order {
              id
              code
              customer {
                id
                firstName
                lastName
                emailAddress
              }
            }
            ... on ErrorResult {
              errorCode
              message
            }
          }
        }`,
        {
          orderId: input.orderId,
          customerId: input.customerId,
        }
      );

      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "vendure_transition_order",
    "Transition an order to a new state.",
    {
      id: z.string().describe("Order ID"),
      state: z.string().describe("Target order state (e.g. 'ArrangingPayment', 'PaymentSettled', 'Shipped', 'Delivered')"),
    },
    async (input) => {
      const { env } = await getActiveEnv();
      const client = createClient(env);

      const data = await client.request(
        `mutation TransitionOrder($id: ID!, $state: String!) {
          transitionOrderToState(id: $id, state: $state) {
            ... on Order {
              id
              code
              state
            }
            ... on OrderStateTransitionError {
              errorCode
              message
              transitionError
              fromState
              toState
            }
          }
        }`,
        { id: input.id, state: input.state }
      );

      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "vendure_cancel_order",
    "Cancel an order.",
    {
      id: z.string().describe("Order ID"),
      reason: z.string().optional().describe("Cancellation reason"),
    },
    async (input) => {
      const { env } = await getActiveEnv();
      const client = createClient(env);

      const data = await client.request(
        `mutation CancelOrder($input: CancelOrderInput!) {
          cancelOrder(input: $input) {
            ... on Order {
              id
              code
              state
            }
            ... on ErrorResult {
              errorCode
              message
            }
          }
        }`,
        {
          input: {
            orderId: input.id,
            ...(input.reason && { reason: input.reason }),
          },
        }
      );

      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    }
  );
}

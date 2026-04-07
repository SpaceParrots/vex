import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  listOrders,
  getOrder,
  createDraftOrder,
  addItemToDraftOrder,
  setCustomerForDraftOrder,
  transitionOrder,
  cancelOrder,
} from "../services/orders.js";

function jsonContent(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export function registerOrderTools(server: McpServer): void {
  server.tool(
    "vendure_get_orders",
    "List orders with optional filters.",
    {
      take: z.number().optional().describe("Number of results to return"),
      skip: z.number().optional().describe("Number of results to skip"),
      filterByCode: z.string().optional().describe("Filter by order code (contains)"),
    },
    async (input) => jsonContent(await listOrders(input))
  );

  server.tool(
    "vendure_get_order",
    "Get a single order by ID with full details.",
    { id: z.string().describe("Order ID") },
    async (input) => jsonContent(await getOrder(input.id))
  );

  server.tool(
    "vendure_create_draft_order",
    "Create a new draft order.",
    {},
    async () => jsonContent(await createDraftOrder())
  );

  server.tool(
    "vendure_add_item_to_draft_order",
    "Add a product variant to a draft order.",
    {
      orderId: z.string().describe("Draft order ID"),
      productVariantId: z.string().describe("Product variant ID to add"),
      quantity: z.number().describe("Quantity to add"),
    },
    async (input) => jsonContent(await addItemToDraftOrder(input))
  );

  server.tool(
    "vendure_set_customer_for_draft_order",
    "Set the customer for a draft order.",
    {
      orderId: z.string().describe("Draft order ID"),
      customerId: z.string().describe("Customer ID to assign"),
    },
    async (input) => jsonContent(await setCustomerForDraftOrder(input))
  );

  server.tool(
    "vendure_transition_order",
    "Transition an order to a new state.",
    {
      id: z.string().describe("Order ID"),
      state: z.string().describe("Target order state (e.g. 'ArrangingPayment', 'PaymentSettled', 'Shipped', 'Delivered')"),
    },
    async (input) => jsonContent(await transitionOrder(input))
  );

  server.tool(
    "vendure_cancel_order",
    "Cancel an order.",
    {
      id: z.string().describe("Order ID"),
      reason: z.string().optional().describe("Cancellation reason"),
    },
    async (input) => jsonContent(await cancelOrder(input))
  );
}

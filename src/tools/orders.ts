/** @module tools/orders — MCP tools for order management (list, get, create-draft, add-item, set-customer, transition, cancel). */

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
import { jsonContent } from "../output.js";

/** Registers all `vex_*_order*` MCP tools for order operations. */
export function registerOrderTools(server: McpServer): void {
  server.tool(
    "vex_get_orders",
    "List orders with optional filters.",
    {
      take: z.number().optional().describe("Number of results to return"),
      skip: z.number().optional().describe("Number of results to skip"),
      filterByCode: z.string().optional().describe("Filter by order code (contains)"),
    },
    async (input) => jsonContent(await listOrders(input))
  );

  server.tool(
    "vex_get_order",
    "Get a single order by ID with full details.",
    { id: z.string().describe("Order ID") },
    async (input) => jsonContent(await getOrder(input.id))
  );

  server.tool(
    "vex_create_draft_order",
    "Create a new draft order.",
    {},
    async () => jsonContent(await createDraftOrder())
  );

  server.tool(
    "vex_add_item_to_draft_order",
    "Add a product variant to a draft order.",
    {
      orderId: z.string().describe("Draft order ID"),
      productVariantId: z.string().describe("Product variant ID to add"),
      quantity: z.number().describe("Quantity to add"),
    },
    async (input) => jsonContent(await addItemToDraftOrder(input))
  );

  server.tool(
    "vex_set_customer_for_draft_order",
    "Set the customer for a draft order.",
    {
      orderId: z.string().describe("Draft order ID"),
      customerId: z.string().describe("Customer ID to assign"),
    },
    async (input) => jsonContent(await setCustomerForDraftOrder(input))
  );

  server.tool(
    "vex_transition_order",
    "Transition an order to a new state.",
    {
      id: z.string().describe("Order ID"),
      state: z.string().describe("Target order state (e.g. 'ArrangingPayment', 'PaymentSettled', 'Shipped', 'Delivered')"),
    },
    async (input) => jsonContent(await transitionOrder(input))
  );

  server.tool(
    "vex_cancel_order",
    "Cancel an order.",
    {
      id: z.string().describe("Order ID"),
      reason: z.string().optional().describe("Cancellation reason"),
    },
    async (input) => jsonContent(await cancelOrder(input))
  );
}

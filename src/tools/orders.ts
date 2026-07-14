/** @module tools/orders — `vex_orders` action-dispatch MCP tool (list, get, create_draft, add_item, set_customer, transition, cancel). */

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
import { actionTool } from "./action-tool.js";

/** Registers the `vex_orders` MCP tool covering all order operations. */
export function registerOrderTools(server: McpServer): void {
  actionTool(server, "vex_orders", "Manage Vendure orders and draft orders.", {
    list: {
      summary: "List orders with optional code filter.",
      shape: {
        take: z.number().optional().describe("Items per page (default 20)."),
        skip: z.number().optional().describe("Items to skip (default 0)."),
        filterByCode: z.string().optional().describe("Filter by order code (contains)"),
      },
      handler: async (a) => jsonContent(await listOrders(a as Parameters<typeof listOrders>[0])),
    },
    get: {
      summary: "Get a single order by ID with full details.",
      shape: { id: z.string().describe("Order ID") },
      handler: async (a) => jsonContent(await getOrder(a.id as string)),
    },
    create_draft: {
      summary: "Create a new draft order.",
      shape: {},
      handler: async () => jsonContent(await createDraftOrder()),
    },
    add_item: {
      summary: "Add a product variant to a draft order.",
      shape: {
        orderId: z.string().describe("Draft order ID"),
        productVariantId: z.string().describe("Product variant ID to add"),
        quantity: z.number().describe("Quantity to add"),
      },
      handler: async (a) => jsonContent(await addItemToDraftOrder(a as unknown as Parameters<typeof addItemToDraftOrder>[0])),
    },
    set_customer: {
      summary: "Set the customer for a draft order.",
      shape: {
        orderId: z.string().describe("Draft order ID"),
        customerId: z.string().describe("Customer ID to assign"),
      },
      handler: async (a) => jsonContent(await setCustomerForDraftOrder(a as unknown as Parameters<typeof setCustomerForDraftOrder>[0])),
    },
    transition: {
      summary: "Transition an order to a new state.",
      shape: {
        id: z.string().describe("Order ID"),
        state: z.string().describe("Target order state (e.g. 'ArrangingPayment', 'PaymentSettled', 'Shipped', 'Delivered')"),
      },
      handler: async (a) => jsonContent(await transitionOrder(a as unknown as Parameters<typeof transitionOrder>[0])),
    },
    cancel: {
      summary: "Cancel an order.",
      shape: {
        id: z.string().describe("Order ID"),
        reason: z.string().optional().describe("Cancellation reason"),
      },
      handler: async (a) => jsonContent(await cancelOrder(a as unknown as Parameters<typeof cancelOrder>[0])),
    },
  });
}

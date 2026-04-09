/** @module commands/order — CLI subcommands for order management (list, get, create-draft, add-item, set-customer, transition, cancel). */

import { Command } from "commander";
import {
  listOrders,
  getOrder,
  createDraftOrder,
  addItemToDraftOrder,
  setCustomerForDraftOrder,
  transitionOrder,
  cancelOrder,
} from "../services/orders.js";
import { printJson, handleError } from "../output.js";

/** Creates the `vex order` command group with list, get, create-draft, add-item, set-customer, transition, and cancel subcommands. */
export function createOrderCommand(): Command {
  const order = new Command("order").description("Order operations");

  order
    .command("list")
    .description("List orders")
    .option("--take <n>", "Number of results", parseInt)
    .option("--skip <n>", "Offset", parseInt)
    .option("--code <filter>", "Filter by order code")
    .action(async (opts) => {
      try {
        const data = await listOrders({
          take: opts.take,
          skip: opts.skip,
          filterByCode: opts.code,
        });
        printJson(data);
      } catch (err) {
        handleError(err);
      }
    });

  order
    .command("get <id>")
    .description("Get order by ID")
    .action(async (id: string) => {
      try {
        printJson(await getOrder(id));
      } catch (err) {
        handleError(err);
      }
    });

  order
    .command("create-draft")
    .description("Create a new draft order")
    .action(async () => {
      try {
        printJson(await createDraftOrder());
      } catch (err) {
        handleError(err);
      }
    });

  order
    .command("add-item <orderId>")
    .description("Add a product variant to a draft order")
    .requiredOption("--variant <id>", "Product variant ID")
    .requiredOption("--quantity <n>", "Quantity", parseInt)
    .action(async (orderId: string, opts) => {
      try {
        const data = await addItemToDraftOrder({
          orderId,
          productVariantId: opts.variant,
          quantity: opts.quantity,
        });
        printJson(data);
      } catch (err) {
        handleError(err);
      }
    });

  order
    .command("set-customer <orderId>")
    .description("Assign a customer to a draft order")
    .requiredOption("--customer <id>", "Customer ID")
    .action(async (orderId: string, opts) => {
      try {
        const data = await setCustomerForDraftOrder({
          orderId,
          customerId: opts.customer,
        });
        printJson(data);
      } catch (err) {
        handleError(err);
      }
    });

  order
    .command("transition <id>")
    .description("Transition an order to a new state")
    .requiredOption("--state <state>", "Target state (e.g. ArrangingPayment, PaymentSettled, Shipped, Delivered)")
    .action(async (id: string, opts) => {
      try {
        const data = await transitionOrder({ id, state: opts.state });
        printJson(data);
      } catch (err) {
        handleError(err);
      }
    });

  order
    .command("cancel <id>")
    .description("Cancel an order")
    .option("--reason <reason>", "Cancellation reason")
    .action(async (id: string, opts) => {
      try {
        const data = await cancelOrder({ id, reason: opts.reason });
        printJson(data);
      } catch (err) {
        handleError(err);
      }
    });

  return order;
}

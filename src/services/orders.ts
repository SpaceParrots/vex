/**
 * @module services/orders
 *
 * Order management operations for the Vendure Admin API.
 * Supports listing, retrieving, creating draft orders, adding items,
 * setting customers, transitioning state, and cancelling.
 */

import { getClient } from "../client.js";
import { DEFAULT_PAGE_SIZE, DEFAULT_SKIP } from "../constants.js";

/** Options for filtering and paginating the order list. */
export interface OrderListInput {
  readonly take?: number;
  readonly skip?: number;
  readonly filterByCode?: string;
}

/** List orders with optional code filter and pagination. */
export async function listOrders(input: OrderListInput): Promise<unknown> {
  const client = await getClient();

  const filter: Record<string, unknown> = {};
  if (input.filterByCode) {
    filter.code = { contains: input.filterByCode };
  }

  return client.request(
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
        take: input.take ?? DEFAULT_PAGE_SIZE,
        skip: input.skip ?? DEFAULT_SKIP,
        ...(Object.keys(filter).length > 0 && { filter }),
      },
    }
  );
}

/** Retrieve a single order by ID, including lines, payments, and fulfillments. */
export async function getOrder(id: string): Promise<unknown> {
  const client = await getClient();

  return client.request(
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
    { id }
  );
}

/** Create a new empty draft order. */
export async function createDraftOrder(): Promise<unknown> {
  const client = await getClient();

  return client.request(
    `mutation CreateDraftOrder {
      createDraftOrder {
        id
        code
        state
      }
    }`
  );
}

/** Input for adding a product variant to a draft order. */
export interface AddItemInput {
  readonly orderId: string;
  readonly productVariantId: string;
  readonly quantity: number;
}

/** Add a product variant line item to an existing draft order. */
export async function addItemToDraftOrder(input: AddItemInput): Promise<unknown> {
  const client = await getClient();

  return client.request(
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
}

/** Input for assigning a customer to a draft order. */
export interface SetCustomerInput {
  readonly orderId: string;
  readonly customerId: string;
}

/** Assign an existing customer to a draft order. */
export async function setCustomerForDraftOrder(input: SetCustomerInput): Promise<unknown> {
  const client = await getClient();

  return client.request(
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
}

/** Input for transitioning an order to a new state. */
export interface TransitionOrderInput {
  readonly id: string;
  readonly state: string;
}

/**
 * Transition an order to a new state in the Vendure order state machine.
 * Returns an `OrderStateTransitionError` if the transition is not allowed.
 */
export async function transitionOrder(input: TransitionOrderInput): Promise<unknown> {
  const client = await getClient();

  return client.request(
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
}

/** Input for cancelling an order with an optional reason. */
export interface CancelOrderInput {
  readonly id: string;
  readonly reason?: string;
}

/** Cancel an order, optionally providing a reason for the cancellation. */
export async function cancelOrder(input: CancelOrderInput): Promise<unknown> {
  const client = await getClient();

  return client.request(
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
}

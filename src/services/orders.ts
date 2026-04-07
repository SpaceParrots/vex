import { getActiveEnv } from "../config.js";
import { createClient } from "../client.js";

export interface OrderListInput {
  readonly take?: number;
  readonly skip?: number;
  readonly filterByCode?: string;
}

export async function listOrders(input: OrderListInput): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

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
        take: input.take ?? 20,
        skip: input.skip ?? 0,
        ...(Object.keys(filter).length > 0 && { filter }),
      },
    }
  );
}

export async function getOrder(id: string): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

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

export async function createDraftOrder(): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

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

export interface AddItemInput {
  readonly orderId: string;
  readonly productVariantId: string;
  readonly quantity: number;
}

export async function addItemToDraftOrder(input: AddItemInput): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

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

export interface SetCustomerInput {
  readonly orderId: string;
  readonly customerId: string;
}

export async function setCustomerForDraftOrder(input: SetCustomerInput): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

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

export interface TransitionOrderInput {
  readonly id: string;
  readonly state: string;
}

export async function transitionOrder(input: TransitionOrderInput): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

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

export interface CancelOrderInput {
  readonly id: string;
  readonly reason?: string;
}

export async function cancelOrder(input: CancelOrderInput): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

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

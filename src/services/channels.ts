/**
 * @module services/channels
 *
 * Channel operations for the Vendure Admin API.
 * Channels define storefronts with their own currency, language, tax, and shipping defaults.
 */

import { getClient } from "../client.js";
import { DEFAULT_PAGE_SIZE, DEFAULT_SKIP } from "../constants.js";

/** Pagination options for listing channels. */
export interface ChannelListInput {
  readonly take?: number;
  readonly skip?: number;
}

/** Lists channels with pagination. */
export async function listChannels(input: ChannelListInput): Promise<unknown> {
  const client = await getClient();

  return client.request(
    `query GetChannels($options: ChannelListOptions) {
      channels(options: $options) {
        items {
          id
          code
          token
          currencyCode
          defaultCurrencyCode
          defaultLanguageCode
          pricesIncludeTax
          defaultTaxZone { id name }
          defaultShippingZone { id name }
          seller { id name }
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
      },
    }
  );
}

/** Retrieves a single channel by ID with full configuration details. */
export async function getChannel(id: string): Promise<unknown> {
  const client = await getClient();

  return client.request(
    `query GetChannel($id: ID!) {
      channel(id: $id) {
        id
        code
        token
        currencyCode
        defaultCurrencyCode
        availableCurrencyCodes
        defaultLanguageCode
        availableLanguageCodes
        pricesIncludeTax
        trackInventory
        outOfStockThreshold
        defaultTaxZone { id name }
        defaultShippingZone { id name }
        seller { id name }
        createdAt
        updatedAt
      }
    }`,
    { id }
  );
}

/** Retrieves the currently active channel with full configuration details. */
export async function getActiveChannel(): Promise<unknown> {
  const client = await getClient();

  return client.request(
    `query GetActiveChannel {
      activeChannel {
        id
        code
        token
        currencyCode
        defaultCurrencyCode
        availableCurrencyCodes
        defaultLanguageCode
        availableLanguageCodes
        pricesIncludeTax
        trackInventory
        outOfStockThreshold
        defaultTaxZone { id name }
        defaultShippingZone { id name }
        seller { id name }
        createdAt
        updatedAt
      }
    }`
  );
}

/** Input for updating channel defaults. Only provided fields are changed. */
export interface UpdateChannelInput {
  readonly id: string;
  readonly defaultTaxZoneId?: string;
  readonly defaultShippingZoneId?: string;
  readonly defaultLanguageCode?: string;
  readonly defaultCurrencyCode?: string;
  readonly pricesIncludeTax?: boolean;
  readonly trackInventory?: boolean;
  readonly outOfStockThreshold?: number;
}

/** Updates channel settings. Only defined fields in the input are sent. */
export async function updateChannel(input: UpdateChannelInput): Promise<unknown> {
  const client = await getClient();

  const { id, ...fields } = input;
  const updateInput: Record<string, unknown> = { id };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      updateInput[key] = value;
    }
  }

  return client.request(
    `mutation UpdateChannel($input: UpdateChannelInput!) {
      updateChannel(input: $input) {
        ... on Channel {
          id
          code
          defaultTaxZone { id name }
          defaultShippingZone { id name }
          defaultLanguageCode
          defaultCurrencyCode
          pricesIncludeTax
          trackInventory
          outOfStockThreshold
        }
        ... on LanguageNotAvailableError {
          errorCode
          message
        }
      }
    }`,
    { input: updateInput }
  );
}

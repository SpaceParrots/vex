import { getActiveEnv } from "../config.js";
import { createClient } from "../client.js";

export interface ChannelListInput {
  readonly take?: number;
  readonly skip?: number;
}

export async function listChannels(input: ChannelListInput): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

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
        take: input.take ?? 20,
        skip: input.skip ?? 0,
      },
    }
  );
}

export async function getChannel(id: string): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

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

export async function getActiveChannel(): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

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

export async function updateChannel(input: UpdateChannelInput): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

  const updateInput: Record<string, unknown> = { id: input.id };
  if (input.defaultTaxZoneId !== undefined) updateInput.defaultTaxZoneId = input.defaultTaxZoneId;
  if (input.defaultShippingZoneId !== undefined) updateInput.defaultShippingZoneId = input.defaultShippingZoneId;
  if (input.defaultLanguageCode !== undefined) updateInput.defaultLanguageCode = input.defaultLanguageCode;
  if (input.defaultCurrencyCode !== undefined) updateInput.defaultCurrencyCode = input.defaultCurrencyCode;
  if (input.pricesIncludeTax !== undefined) updateInput.pricesIncludeTax = input.pricesIncludeTax;
  if (input.trackInventory !== undefined) updateInput.trackInventory = input.trackInventory;
  if (input.outOfStockThreshold !== undefined) updateInput.outOfStockThreshold = input.outOfStockThreshold;

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

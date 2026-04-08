/**
 * @module services/zones
 *
 * Zone and country management operations for the Vendure Admin API.
 * Zones group countries/regions for tax and shipping configuration.
 * Countries are zone members in Vendure's data model.
 */

import { getClient } from "../client.js";
import { DEFAULT_PAGE_SIZE, DEFAULT_SKIP, COUNTRIES_PAGE_SIZE, DEFAULT_LANGUAGE_CODE } from "../constants.js";

/** Pagination options for listing zones. */
export interface ZoneListInput {
  readonly take?: number;
  readonly skip?: number;
}

/** Lists zones with their members, paginated (defaults: take 20, skip 0). */
export async function listZones(input: ZoneListInput): Promise<unknown> {
  const client = await getClient();

  return client.request(
    `query GetZones($options: ZoneListOptions) {
      zones(options: $options) {
        items {
          id
          name
          createdAt
          updatedAt
          members {
            id
            name
            code
          }
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

/** Retrieves a single zone by ID, including its country members and enabled status. */
export async function getZone(id: string): Promise<unknown> {
  const client = await getClient();

  return client.request(
    `query GetZone($id: ID!) {
      zone(id: $id) {
        id
        name
        createdAt
        updatedAt
        members {
          id
          name
          code
          enabled
        }
      }
    }`,
    { id }
  );
}

/** Input for creating a new zone with an optional set of country member IDs. */
export interface CreateZoneInput {
  readonly name: string;
  readonly memberIds?: readonly string[];
}

/** Creates a new zone, optionally pre-populated with country members. */
export async function createZone(input: CreateZoneInput): Promise<unknown> {
  const client = await getClient();

  return client.request(
    `mutation CreateZone($input: CreateZoneInput!) {
      createZone(input: $input) {
        id
        name
        members {
          id
          name
          code
        }
      }
    }`,
    {
      input: {
        name: input.name,
        ...(input.memberIds && { memberIds: input.memberIds }),
      },
    }
  );
}

/** Input for updating zone properties (currently only the name). */
export interface UpdateZoneInput {
  readonly id: string;
  readonly name?: string;
}

/** Updates zone properties. Only provided fields are sent to the API. */
export async function updateZone(input: UpdateZoneInput): Promise<unknown> {
  const client = await getClient();

  const updateInput: Record<string, unknown> = { id: input.id };
  if (input.name !== undefined) updateInput.name = input.name;

  return client.request(
    `mutation UpdateZone($input: UpdateZoneInput!) {
      updateZone(input: $input) {
        id
        name
        members {
          id
          name
          code
        }
      }
    }`,
    { input: updateInput }
  );
}

/** Deletes a zone by ID. Returns a result with success/failure message. */
export async function deleteZone(id: string): Promise<unknown> {
  const client = await getClient();

  return client.request(
    `mutation DeleteZone($id: ID!) {
      deleteZone(id: $id) {
        result
        message
      }
    }`,
    { id }
  );
}

/** Input for adding country members to an existing zone. */
export interface AddMembersToZoneInput {
  readonly zoneId: string;
  readonly memberIds: readonly string[];
}

/** Adds one or more country members to a zone. Returns the updated zone. */
export async function addMembersToZone(input: AddMembersToZoneInput): Promise<unknown> {
  const client = await getClient();

  return client.request(
    `mutation AddMembersToZone($zoneId: ID!, $memberIds: [ID!]!) {
      addMembersToZone(zoneId: $zoneId, memberIds: $memberIds) {
        id
        name
        members {
          id
          name
          code
        }
      }
    }`,
    {
      zoneId: input.zoneId,
      memberIds: input.memberIds,
    }
  );
}

/** Input for removing country members from an existing zone. */
export interface RemoveMembersFromZoneInput {
  readonly zoneId: string;
  readonly memberIds: readonly string[];
}

/** Removes one or more country members from a zone. Returns the updated zone. */
export async function removeMembersFromZone(input: RemoveMembersFromZoneInput): Promise<unknown> {
  const client = await getClient();

  return client.request(
    `mutation RemoveMembersFromZone($zoneId: ID!, $memberIds: [ID!]!) {
      removeMembersFromZone(zoneId: $zoneId, memberIds: $memberIds) {
        id
        name
        members {
          id
          name
          code
        }
      }
    }`,
    {
      zoneId: input.zoneId,
      memberIds: input.memberIds,
    }
  );
}

/** Input for creating a country. Countries default to enabled if not specified. */
export interface CreateCountryInput {
  readonly name: string;
  readonly code: string;
  readonly enabled?: boolean;
}

/**
 * Creates a country with a translation for the default language code.
 * Countries default to enabled so they are immediately available for zone assignment.
 */
export async function createCountry(input: CreateCountryInput): Promise<unknown> {
  const client = await getClient();

  return client.request(
    `mutation CreateCountry($input: CreateCountryInput!) {
      createCountry(input: $input) {
        id
        name
        code
        enabled
      }
    }`,
    {
      input: {
        code: input.code,
        // Countries are enabled by default so they are immediately available for zone assignment
        enabled: input.enabled ?? true,
        translations: [
          {
            languageCode: DEFAULT_LANGUAGE_CODE,
            name: input.name,
          },
        ],
      },
    }
  );
}

/** Pagination options for listing countries. */
export interface CountryListInput {
  readonly take?: number;
  readonly skip?: number;
}

/** Lists countries with pagination (defaults: take 250, skip 0). Uses a larger page size since countries are a bounded set. */
export async function listCountries(input: CountryListInput): Promise<unknown> {
  const client = await getClient();

  return client.request(
    `query GetCountries($options: CountryListOptions) {
      countries(options: $options) {
        items {
          id
          name
          code
          enabled
        }
        totalItems
      }
    }`,
    {
      options: {
        take: input.take ?? COUNTRIES_PAGE_SIZE,
        skip: input.skip ?? DEFAULT_SKIP,
      },
    }
  );
}

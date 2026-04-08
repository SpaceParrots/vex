import { getActiveEnv } from "../config.js";
import { createClient } from "../client.js";

export interface ZoneListInput {
  readonly take?: number;
  readonly skip?: number;
}

export async function listZones(input: ZoneListInput): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

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
        take: input.take ?? 20,
        skip: input.skip ?? 0,
      },
    }
  );
}

export async function getZone(id: string): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

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

export interface CreateZoneInput {
  readonly name: string;
  readonly memberIds?: readonly string[];
}

export async function createZone(input: CreateZoneInput): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

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

export interface UpdateZoneInput {
  readonly id: string;
  readonly name?: string;
}

export async function updateZone(input: UpdateZoneInput): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

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

export async function deleteZone(id: string): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

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

export interface AddMembersToZoneInput {
  readonly zoneId: string;
  readonly memberIds: readonly string[];
}

export async function addMembersToZone(input: AddMembersToZoneInput): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

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

export interface RemoveMembersFromZoneInput {
  readonly zoneId: string;
  readonly memberIds: readonly string[];
}

export async function removeMembersFromZone(input: RemoveMembersFromZoneInput): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

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

export interface CreateCountryInput {
  readonly name: string;
  readonly code: string;
  readonly enabled?: boolean;
}

export async function createCountry(input: CreateCountryInput): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

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
        enabled: input.enabled ?? true,
        translations: [
          {
            languageCode: "en",
            name: input.name,
          },
        ],
      },
    }
  );
}

export interface CountryListInput {
  readonly take?: number;
  readonly skip?: number;
}

export async function listCountries(input: CountryListInput): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);

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
        take: input.take ?? 250,
        skip: input.skip ?? 0,
      },
    }
  );
}

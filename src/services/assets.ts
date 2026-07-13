/**
 * @module services/assets
 *
 * Asset operations against the Vendure Admin API: multipart upload via the
 * `Upload` scalar (createAssets), plus list/get/update/delete. Mutations
 * return unions — the selection covers both the entity and error branches.
 */

import { getClient } from "../client.js";
import { getCurrentEnv } from "../context.js";
import { requestWithUploads } from "../upload.js";
import { DEFAULT_PAGE_SIZE, DEFAULT_SKIP } from "../constants.js";

const ASSET_FIELDS = `id createdAt name type fileSize mimeType width height source preview tags { value }`;

/** Input for uploading one or more files as new assets. */
export interface UploadAssetsInput {
  /** Local file paths to upload. */
  readonly filePaths: readonly string[];
  /** Optional tags applied to every uploaded asset. */
  readonly tags?: readonly string[];
}

/**
 * Uploads local files as new assets via the `createAssets` mutation
 * (multipart request). The result array contains `Asset` entries and/or
 * `MimeTypeError` entries — callers must branch on `__typename`.
 */
export async function uploadAssets(input: UploadAssetsInput): Promise<unknown> {
  const ctx = await getCurrentEnv();
  const variables = {
    input: input.filePaths.map(() => ({
      file: null,
      ...(input.tags ? { tags: input.tags } : {}),
    })),
  };
  const files = Object.fromEntries(input.filePaths.map((fp, i) => [`input.${i}.file`, fp]));
  const document = `
    mutation CreateAssets($input: [CreateAssetInput!]!) {
      createAssets(input: $input) {
        __typename
        ... on Asset { ${ASSET_FIELDS} }
        ... on MimeTypeError { errorCode message fileName mimeType }
      }
    }
  `;
  const data = await requestWithUploads<{ createAssets: unknown }>(
    ctx.env,
    document,
    variables,
    files,
    ctx.name
  );
  return data.createAssets;
}

/** Input for listing assets with pagination and an optional name filter. */
export interface ListAssetsInput {
  readonly take?: number;
  readonly skip?: number;
  /** Case-insensitive substring filter on the asset name. */
  readonly nameContains?: string;
}

/** Lists assets with Vendure ListOptions pagination. */
export async function listAssets(input: ListAssetsInput = {}): Promise<unknown> {
  const client = await getClient();
  const query = `
    query Assets($options: AssetListOptions) {
      assets(options: $options) {
        items { ${ASSET_FIELDS} }
        totalItems
      }
    }
  `;
  return client.request(query, {
    options: {
      take: input.take ?? DEFAULT_PAGE_SIZE,
      skip: input.skip ?? DEFAULT_SKIP,
      ...(input.nameContains ? { filter: { name: { contains: input.nameContains } } } : {}),
    },
  });
}

/** Fetches a single asset by ID, including focal point and tags. */
export async function getAsset(id: string): Promise<unknown> {
  const client = await getClient();
  const query = `
    query Asset($id: ID!) {
      asset(id: $id) { ${ASSET_FIELDS} focalPoint { x y } }
    }
  `;
  return client.request(query, { id });
}

/** Input for updating an asset's metadata. */
export interface UpdateAssetInput {
  readonly id: string;
  readonly name?: string;
  readonly tags?: readonly string[];
  readonly focalPoint?: { readonly x: number; readonly y: number };
}

/** Updates an asset's name, tags, and/or focal point. */
export async function updateAsset(input: UpdateAssetInput): Promise<unknown> {
  const client = await getClient();
  const mutation = `
    mutation UpdateAsset($input: UpdateAssetInput!) {
      updateAsset(input: $input) { ${ASSET_FIELDS} focalPoint { x y } }
    }
  `;
  return client.request(mutation, {
    input: {
      id: input.id,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.focalPoint !== undefined ? { focalPoint: input.focalPoint } : {}),
    },
  });
}

/** Deletes an asset by ID. Returns Vendure's DeletionResponse (result + message). */
export async function deleteAsset(id: string): Promise<unknown> {
  const client = await getClient();
  const mutation = `
    mutation DeleteAsset($input: DeleteAssetInput!) {
      deleteAsset(input: $input) { result message }
    }
  `;
  return client.request(mutation, { input: { assetId: id } });
}

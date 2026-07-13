/**
 * @module services/query
 *
 * Raw GraphQL query and mutation execution against the active Vendure
 * Admin API environment. Used by the `vex_query` and `vex_mutate`
 * MCP tools for ad-hoc operations not covered by typed service functions.
 */

import { getClient } from "../client.js";
import { getCurrentEnv } from "../context.js";
import { requestWithUploads } from "../upload.js";

/**
 * Executes an arbitrary GraphQL query against the active environment.
 *
 * @param query - The GraphQL query string.
 * @param variables - Optional variables to pass to the query.
 */
export async function executeQuery(
  query: string,
  variables?: Record<string, unknown>
): Promise<unknown> {
  const client = await getClient();
  return client.request(query, variables);
}

/**
 * Executes an arbitrary GraphQL mutation against the active environment.
 *
 * @param mutation - The GraphQL mutation string.
 * @param variables - Optional variables to pass to the mutation.
 */
export async function executeMutation(
  mutation: string,
  variables?: Record<string, unknown>
): Promise<unknown> {
  const client = await getClient();
  return client.request(mutation, variables);
}

/**
 * Executes a GraphQL mutation containing `Upload`-scalar variables against
 * the current environment via a multipart request. Any custom plugin
 * mutation works — no typed tool needed.
 *
 * @param mutation - The GraphQL mutation string.
 * @param variables - Non-file variables (file positions may be omitted).
 * @param files - Dotted variable path (e.g. `"input.0.file"`) → local file path.
 */
export async function executeMutationWithFiles(
  mutation: string,
  variables: Record<string, unknown> | undefined,
  files: Readonly<Record<string, string>>
): Promise<unknown> {
  const ctx = await getCurrentEnv();
  return requestWithUploads(ctx.env, mutation, variables ?? {}, files, ctx.name);
}

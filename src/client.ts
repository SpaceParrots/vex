import { GraphQLClient } from "graphql-request";
import type { Environment } from "./config.js";
import { getCurrentEnv } from "./env-context.js";
import { API_KEY_HEADER } from "./constants.js";
import { toVexError } from "./errors.js";

/**
 * Creates a GraphQL client configured for the given Vendure environment.
 *
 * Thrown request failures are normalized into typed {@link VexError}s (compact
 * messages that never echo the request body; the raw error stays on `.cause`).
 *
 * @param env - The environment containing the API URL and key.
 * @param envName - Optional environment name; enables schema-aware error
 *   enrichment (e.g. permission suggestions) for callers that know it.
 * @returns A configured {@link GraphQLClient} instance.
 */
export function createClient(env: Environment, envName?: string): GraphQLClient {
  void envName; // consumed by permission enrichment in a later change
  const client = new GraphQLClient(env.url, {
    headers: {
      [API_KEY_HEADER]: env.apiKey,
    },
  });
  const originalRequest = client.request.bind(client);
  client.request = (async (...args: Parameters<typeof originalRequest>) => {
    try {
      return await originalRequest(...args);
    } catch (err) {
      throw toVexError(err);
    }
  }) as typeof client.request;
  return client;
}

/**
 * Convenience helper that resolves the current environment
 * (override > VEX_ENV > active) and returns a ready-to-use GraphQL client.
 *
 * @returns A configured {@link GraphQLClient} for the current environment.
 * @throws If no environment is configured or the resolved name is not found.
 */
export async function getClient(): Promise<GraphQLClient> {
  const { name, env } = await getCurrentEnv();
  return createClient(env, name);
}

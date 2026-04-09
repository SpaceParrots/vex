import { GraphQLClient } from "graphql-request";
import type { Environment } from "./config.js";
import { getActiveEnv } from "./config.js";
import { API_KEY_HEADER } from "./constants.js";

/**
 * Creates a GraphQL client configured for the given Vendure environment.
 *
 * @param env - The environment containing the API URL and key.
 * @returns A configured {@link GraphQLClient} instance.
 */
export function createClient(env: Environment): GraphQLClient {
  return new GraphQLClient(env.url, {
    headers: {
      [API_KEY_HEADER]: env.apiKey,
    },
  });
}

/**
 * Convenience helper that resolves the active environment and returns
 * a ready-to-use GraphQL client.
 *
 * @returns A configured {@link GraphQLClient} for the active environment.
 * @throws If no active environment is configured.
 */
export async function getClient(): Promise<GraphQLClient> {
  const { env } = await getActiveEnv();
  return createClient(env);
}

import { GraphQLClient } from "graphql-request";
import type { Environment } from "./config.js";
import { getCurrentEnv } from "./env-context.js";
import { API_KEY_HEADER } from "./constants.js";

interface GraphQLErrorShape {
  readonly message?: string;
  readonly path?: ReadonlyArray<string | number>;
  readonly extensions?: { readonly code?: string };
}

interface ClientErrorShape {
  readonly response?: {
    readonly status?: number;
    readonly errors?: ReadonlyArray<GraphQLErrorShape>;
  };
  readonly message?: string;
}

/**
 * Distills a `graphql-request` ClientError into a short, single-line message.
 * The raw library error stringifies the full request body (entire query SDL
 * plus variables) into `message`, which inflates every failed call by hundreds
 * to thousands of tokens. This helper extracts just the GraphQL error
 * messages, error codes (`extensions.code`), and field paths.
 */
export function compactGraphQLError(err: unknown): Error {
  if (!err || typeof err !== "object") {
    return err instanceof Error ? err : new Error(String(err));
  }
  const e = err as ClientErrorShape;
  const errors = e.response?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const parts = errors.map((g) => {
      const code = g.extensions?.code ? ` [${g.extensions.code}]` : "";
      const path = g.path && g.path.length ? ` @ ${g.path.join(".")}` : "";
      return `${g.message ?? "unknown error"}${code}${path}`;
    });
    const prefix = e.response?.status ? `HTTP ${e.response.status} — ` : "";
    const out = new Error(`${prefix}${parts.join("; ")}`);
    // Preserve the cause for callers that want the raw shape without echoing it.
    (out as Error & { cause?: unknown }).cause = err;
    return out;
  }
  if (e.response?.status) {
    const out = new Error(`HTTP ${e.response.status}`);
    (out as Error & { cause?: unknown }).cause = err;
    return out;
  }
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * Creates a GraphQL client configured for the given Vendure environment.
 *
 * The returned client transparently compacts `graphql-request`'s `ClientError`
 * messages so failures don't echo the full request body into the response.
 *
 * @param env - The environment containing the API URL and key.
 * @returns A configured {@link GraphQLClient} instance.
 */
export function createClient(env: Environment): GraphQLClient {
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
      throw compactGraphQLError(err);
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
  const { env } = await getCurrentEnv();
  return createClient(env);
}

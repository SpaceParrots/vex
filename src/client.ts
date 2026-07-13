/**
 * @module client
 *
 * GraphQL client factory for the Vendure Admin API.
 *
 * vex uses exactly one shape of GraphQL call: a document *string* plus an
 * optional variables object. `graphql-request`'s `request()` is heavily
 * overloaded (string | DocumentNode | TypedDocumentNode | a single options
 * object), and wrapping that overload set to intercept errors required
 * casting both the arguments and the patched method. So instead of patching
 * `GraphQLClient`, this module exposes {@link VexClient} — the narrow surface
 * vex actually calls — and delegates to `graphql-request` inside it. The
 * document is therefore always a string by construction, which is what
 * {@link enrichPermissionError} needs to name the denied operation.
 */

import { GraphQLClient } from "graphql-request";
import type { Environment } from "./config.js";
import { getCurrentEnv } from "./context.js";
import { API_KEY_HEADER } from "./constants.js";
import { toVexError } from "./errors.js";
import { enrichPermissionError } from "./permission-errors.js";

/**
 * The GraphQL surface vex uses: one operation per call, sent as a document
 * string with optional variables. Deliberately narrower than
 * `graphql-request`'s `GraphQLClient` — see the module doc.
 */
export interface VexClient {
  /**
   * Executes `document` against the environment's Admin API.
   *
   * @throws {VexError} Every failure is normalized — compact messages that
   *   never echo the request body, with the raw error kept on `.cause`. When
   *   the client knows its environment name, a permission denial is enriched
   *   with the denied operation and the permissions likely required.
   */
  request<T = unknown>(document: string, variables?: Record<string, unknown>): Promise<T>;
}

/**
 * Creates a {@link VexClient} for the given Vendure environment.
 *
 * @param env - The environment containing the API URL and key.
 * @param envName - Optional environment name; enables schema-aware error
 *   enrichment (permission suggestions) for callers that know it.
 */
export function createClient(env: Environment, envName?: string): VexClient {
  const client = new GraphQLClient(env.url, {
    headers: {
      [API_KEY_HEADER]: env.apiKey,
    },
  });

  return {
    async request<T = unknown>(document: string, variables?: Record<string, unknown>): Promise<T> {
      try {
        return await client.request<T>(document, variables ?? {});
      } catch (err) {
        const vexErr = toVexError(err);
        if (!envName) throw vexErr;
        throw await enrichPermissionError(vexErr, envName, document);
      }
    },
  };
}

/**
 * Convenience helper that resolves the current environment
 * (override > VEX_ENV > project link > active) and returns a ready-to-use client.
 *
 * @throws {NoEnvironmentError} If no environment is configured.
 * @throws {EnvNotFoundError} If the resolved environment name is not found.
 */
export async function getClient(): Promise<VexClient> {
  const { name, env } = await getCurrentEnv();
  return createClient(env, name);
}

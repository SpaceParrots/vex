/**
 * @module schema-model/parse
 *
 * Parses cached SDL text into a `GraphQLSchema` and caches the result per
 * environment name + SDL hash. Pure (no I/O); the SDL string is the input.
 */

import { createHash } from "node:crypto";
import { buildSchema, type GraphQLSchema } from "graphql";

/** A cached parsed schema plus the hash of the SDL it was built from. */
interface CacheEntry {
  readonly hash: string;
  readonly schema: GraphQLSchema;
}

/** In-process schema cache, keyed by environment name. */
const cache = new Map<string, CacheEntry>();

/** Returns a SHA-256 hex digest of `sdl`, used to detect when cached SDL has changed. */
function hashSdl(sdl: string): string {
  return createHash("sha256").update(sdl).digest("hex");
}

/**
 * Parses SDL into a `GraphQLSchema`, reusing the cached instance when SDL is unchanged.
 *
 * @returns A shared cached `GraphQLSchema` reference. Do not mutate the returned schema —
 *          subsequent callers receive the same instance until the SDL changes or the cache
 *          is cleared.
 */
export function parseSchemaFromSdl(envName: string, sdl: string): GraphQLSchema {
  const hash = hashSdl(sdl);
  const cached = cache.get(envName);
  if (cached && cached.hash === hash) {
    return cached.schema;
  }
  const schema = buildSchema(sdl);
  cache.set(envName, { hash, schema });
  return schema;
}

/** Clears the in-process schema cache. Used by tests and by `vex_refetch_schema`. */
export function clearSchemaCache(envName?: string): void {
  if (envName) {
    cache.delete(envName);
  } else {
    cache.clear();
  }
}

/**
 * @module schema-model/parse
 *
 * Parses cached SDL text into a `GraphQLSchema` and caches the result per
 * environment name + SDL hash. Pure (no I/O); the SDL string is the input.
 */

import { createHash } from "node:crypto";
import { buildSchema, type GraphQLSchema } from "graphql";

interface CacheEntry {
  readonly hash: string;
  readonly schema: GraphQLSchema;
}

const cache = new Map<string, CacheEntry>();

function hashSdl(sdl: string): string {
  return createHash("sha256").update(sdl).digest("hex");
}

/** Parses SDL into a `GraphQLSchema`, reusing the cached instance when SDL is unchanged. */
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

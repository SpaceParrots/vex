/**
 * @module schema
 *
 * Handles GraphQL schema introspection and caching for Vendure environments.
 * Schemas are stored as SDL files at `~/.vendure-vex/schemas/{envName}.graphql`.
 * Supports two source modes: "endpoint" (live introspection) and "file" (local SDL).
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { type IntrospectionQuery, getIntrospectionQuery, buildClientSchema, printSchema } from "graphql";
import { createClient } from "./client.js";
import { getSchemaPath, type Environment } from "./config.js";

/**
 * Runs a GraphQL introspection query against the given environment and
 * returns the schema as SDL text.
 *
 * @param env - Environment with API credentials.
 * @param endpoint - Optional override URL for introspection (defaults to `env.url`).
 */
async function introspect(env: Environment, endpoint?: string): Promise<string> {
  const client = createClient({
    ...env,
    url: endpoint ?? env.url,
  });
  const data = await client.request<IntrospectionQuery>(
    getIntrospectionQuery()
  );
  const schema = buildClientSchema(data);
  return printSchema(schema);
}

/**
 * Fetches the schema from the configured source and caches it to disk.
 *
 * @param env - Environment with schema source configuration.
 * @param envName - Used to derive the cache file path.
 */
async function fetchSchema(
  env: Environment,
  envName: string
): Promise<string> {
  const schemaPath = getSchemaPath(envName);
  let sdl: string;

  if (env.schemaSource?.type === "file") {
    const filePath = env.schemaSource.value;
    if (!filePath) {
      throw new Error("Schema source type is 'file' but no path was provided.");
    }
    sdl = await readFile(filePath, "utf-8");
  } else {
    const endpoint = env.schemaSource?.value ?? undefined;
    sdl = await introspect(env, endpoint);
  }

  // Cache the schema
  await mkdir(dirname(schemaPath), { recursive: true });
  await writeFile(schemaPath, sdl, "utf-8");
  return sdl;
}

/**
 * Loads the cached schema for an environment, fetching it if no cache exists.
 *
 * @param env - Environment configuration.
 * @param envName - Environment name for cache lookup.
 * @throws If no cache exists and no schema source is configured.
 */
export async function loadSchema(
  env: Environment,
  envName: string
): Promise<string> {
  const schemaPath = getSchemaPath(envName);
  if (existsSync(schemaPath)) {
    return readFile(schemaPath, "utf-8");
  }
  if (!env.schemaSource) {
    throw new Error(
      `No schema source configured for environment "${envName}". ` +
        "Configure one via vex_setup or use vex_refetch_schema with an introspection endpoint."
    );
  }
  return fetchSchema(env, envName);
}

/**
 * Fetches and caches a fresh schema, ignoring any existing cache.
 * Falls back to introspecting the API URL if no schema source is configured.
 *
 * @param env - Environment configuration.
 * @param envName - Environment name for cache storage.
 */
export async function refetchSchema(
  env: Environment,
  envName: string
): Promise<string> {
  if (!env.schemaSource) {
    // Default to introspecting the API URL
    const envWithSource: Environment = {
      ...env,
      schemaSource: { type: "endpoint" },
    };
    return fetchSchema(envWithSource, envName);
  }
  return fetchSchema(env, envName);
}

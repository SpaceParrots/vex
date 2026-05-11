/**
 * @module services/env
 *
 * Environment management operations. Wraps the lower-level config functions
 * with higher-level input/output types used by CLI commands and MCP tools.
 */

import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { buildSchema } from "graphql";
import {
  addEnv as addEnvConfig,
  removeEnv as removeEnvConfig,
  switchEnv as switchEnvConfig,
  updateEnv as updateEnvConfig,
  listEnvs as listEnvsConfig,
  loadConfig,
  getSchemaPath,
  type Environment,
} from "../config.js";
import { refetchSchema } from "../schema.js";
import { createClient } from "../client.js";
import { API_KEY_MASK_LENGTH, API_KEY_MASK_SUFFIX } from "../constants.js";

interface GraphQLRequestError {
  readonly response: {
    readonly status: number;
    readonly errors?: ReadonlyArray<{ readonly message?: string }>;
  };
}

function isGraphQLRequestError(err: unknown): err is GraphQLRequestError {
  if (!err || typeof err !== "object") return false;
  const response = (err as { response?: unknown }).response;
  if (!response || typeof response !== "object") return false;
  return typeof (response as { status?: unknown }).status === "number";
}

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

function tildeify(p: string): string {
  const home = homedir();
  if (home && p.startsWith(home)) {
    return "~" + p.slice(home.length);
  }
  return p;
}

/** Input for adding a new Vendure environment. */
export interface AddEnvInput {
  readonly name: string;
  readonly url: string;
  readonly apiKey: string;
  readonly schemaType?: "endpoint" | "file";
  readonly schemaValue?: string;
  readonly fetchSchema?: boolean;
}

/** Result returned after adding a new environment. */
export interface AddEnvResult {
  readonly name: string;
  readonly isActive: boolean;
  readonly schemaFetched: boolean;
  readonly schemaError?: string;
}

/** Adds a new environment and optionally fetches its schema. */
export async function addEnvironment(input: AddEnvInput): Promise<AddEnvResult> {
  const env: Environment = {
    url: input.url,
    apiKey: input.apiKey,
    ...(input.schemaType && {
      schemaSource: {
        type: input.schemaType,
        value: input.schemaValue,
      },
    }),
  };

  const config = await addEnvConfig(input.name, env);
  const isActive = config.activeEnvironment === input.name;
  let schemaFetched = false;
  let schemaError: string | undefined;

  if (input.fetchSchema && env.schemaSource) {
    try {
      await refetchSchema(env, input.name);
      schemaFetched = true;
    } catch (err) {
      schemaError = err instanceof Error ? err.message : String(err);
    }
  }

  return { name: input.name, isActive, schemaFetched, schemaError };
}

/** Input for updating an existing environment's fields. */
export interface UpdateEnvInput {
  readonly name: string;
  readonly url?: string;
  readonly apiKey?: string;
  readonly schemaType?: "endpoint" | "file";
  readonly schemaValue?: string;
}

/** Updates an environment's configuration. Returns the list of updated field names. */
export async function updateEnvironment(input: UpdateEnvInput): Promise<readonly string[]> {
  const fields: Partial<Environment> = {};
  const updated: string[] = [];

  if (input.url !== undefined) {
    fields.url = input.url;
    updated.push("url");
  }
  if (input.apiKey !== undefined) {
    fields.apiKey = input.apiKey;
    updated.push("apiKey");
  }
  if (input.schemaType !== undefined) {
    fields.schemaSource = {
      type: input.schemaType,
      value: input.schemaValue,
    };
    updated.push("schemaSource");
  }

  if (updated.length === 0) {
    throw new Error("No fields to update. Provide at least one of: --url, --api-key, --schema-type.");
  }

  await updateEnvConfig(input.name, fields);
  return updated;
}

/** Removes an environment by name. */
export async function removeEnvironment(name: string): Promise<void> {
  await removeEnvConfig(name);
}

/** Switches the active environment. */
export async function switchEnvironment(name: string): Promise<void> {
  await switchEnvConfig(name);
}

/** Result containing all environments and the active one. */
export interface EnvListResult {
  readonly active: string;
  readonly environments: Readonly<Record<string, Environment>>;
}

/** Lists all configured environments. */
export async function listEnvironments(): Promise<EnvListResult> {
  return listEnvsConfig();
}

/** Detailed view of a single environment with a masked API key. */
export interface EnvShowResult {
  readonly name: string;
  readonly active: boolean;
  readonly url: string;
  readonly apiKeyMasked: string;
  readonly schemaSource?: { readonly type: string; readonly value?: string };
}

/** A single readiness check (endpoint or schema). */
export interface EnvCheck {
  readonly ok: boolean;
  readonly detail: string;
}

/** Aggregated readiness report for an environment. */
export interface EnvStatusResult {
  readonly name: string;
  readonly active: boolean;
  readonly url: string;
  readonly endpoint: EnvCheck;
  readonly schema: EnvCheck;
}

/** Posts a trivial GraphQL query to confirm the endpoint is reachable and accepting the API key. */
async function checkEndpoint(env: Environment): Promise<EnvCheck> {
  const client = createClient(env);
  try {
    await client.request<{ __typename: string }>("{ __typename }");
    return { ok: true, detail: "reachable, API key accepted" };
  } catch (err: unknown) {
    if (isGraphQLRequestError(err)) {
      const status = err.response.status;
      const firstError = err.response.errors?.[0]?.message;
      if (status === 401 || status === 403) {
        return { ok: false, detail: `reachable but unauthorized (HTTP ${status})` };
      }
      // Any GraphQL response means the endpoint is up, even if the query was rejected.
      return { ok: true, detail: `reachable (HTTP ${status}${firstError ? `: ${firstError}` : ""})` };
    }
    if (isErrnoException(err) && err.code) {
      return { ok: false, detail: `not reachable (${err.code})` };
    }
    return { ok: false, detail: err instanceof Error ? err.message : "unknown error" };
  }
}

/** Verifies that an SDL schema can be loaded — from the configured file, the cached file, or fresh introspection. */
async function checkSchema(env: Environment, envName: string): Promise<EnvCheck> {
  if (env.schemaSource?.type === "file") {
    const path = env.schemaSource.value;
    if (!path) return { ok: false, detail: "schema source is 'file' but no path is set" };
    if (!existsSync(path)) return { ok: false, detail: `file not found: ${tildeify(path)}` };
    try {
      const sdl = await readFile(path, "utf-8");
      buildSchema(sdl);
      const info = await stat(path);
      return { ok: true, detail: `local file (${info.size} bytes): ${tildeify(path)}` };
    } catch (err) {
      return { ok: false, detail: `file unreadable or invalid SDL: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  const cachePath = getSchemaPath(envName);
  if (existsSync(cachePath)) {
    try {
      const sdl = await readFile(cachePath, "utf-8");
      buildSchema(sdl);
      const info = await stat(cachePath);
      return { ok: true, detail: `cached (${info.size} bytes, mtime ${info.mtime.toISOString()})` };
    } catch (err) {
      return { ok: false, detail: `cache unreadable or invalid SDL: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  try {
    await refetchSchema(env, envName);
    return { ok: true, detail: "fetched fresh via introspection" };
  } catch (err) {
    return { ok: false, detail: `introspection failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Runs endpoint reachability and schema accessibility checks for the named (or active) environment. */
export async function statusEnvironment(name?: string): Promise<EnvStatusResult> {
  const config = await loadConfig();
  const targetName = name ?? config.activeEnvironment;
  if (!targetName) {
    throw new Error("No environment specified and no active environment set.");
  }
  const env = config.environments[targetName];
  if (!env) {
    throw new Error(`Environment "${targetName}" not found.`);
  }

  const [endpoint, schema] = await Promise.all([
    checkEndpoint(env),
    checkSchema(env, targetName),
  ]);

  return {
    name: targetName,
    active: config.activeEnvironment === targetName,
    url: env.url,
    endpoint,
    schema,
  };
}

/** Shows details for the specified (or active) environment with a masked API key. */
export async function showEnvironment(name?: string): Promise<EnvShowResult> {
  const config = await loadConfig();
  const targetName = name ?? config.activeEnvironment;
  if (!targetName) {
    throw new Error("No environment specified and no active environment set.");
  }
  const env = config.environments[targetName];
  if (!env) {
    throw new Error(`Environment "${targetName}" not found.`);
  }
  return {
    name: targetName,
    active: config.activeEnvironment === targetName,
    url: env.url,
    apiKeyMasked: env.apiKey.slice(0, API_KEY_MASK_LENGTH) + API_KEY_MASK_SUFFIX,
    schemaSource: env.schemaSource,
  };
}

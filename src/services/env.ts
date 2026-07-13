/**
 * @module services/env
 *
 * Environment management operations. Wraps the lower-level config functions
 * with higher-level input/output types used by CLI commands and MCP tools.
 */

import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { buildSchema } from "graphql";
import {
  addEnv as addEnvConfig,
  removeEnv as removeEnvConfig,
  switchEnv as switchEnvConfig,
  updateEnv as updateEnvConfig,
  linkProject,
  unlinkProject,
  loadConfig,
  getSchemaPath,
  envNotFoundMessage,
  noEnvironmentMessage,
  type Environment,
} from "../config.js";
import { refetchSchema } from "../schema.js";
import { createClient } from "../client.js";
import { API_KEY_MASK_LENGTH, API_KEY_MASK_SUFFIX } from "../constants.js";
import { getCurrentEnv, type EnvSource } from "../context.js";
import { NoEnvironmentError, EnvNotFoundError, VexError } from "../errors.js";

/** The shape of a `graphql-request` `ClientError`'s `.response`. */
interface GraphQLRequestError {
  readonly response: {
    readonly status: number;
    readonly errors?: ReadonlyArray<{ readonly message?: string }>;
  };
}

/** Type guard: does `value` look like a `graphql-request` error with a `.response.status`? */
function hasGraphQLResponse(value: unknown): value is GraphQLRequestError {
  if (!value || typeof value !== "object") return false;
  const response = (value as { response?: unknown }).response;
  if (!response || typeof response !== "object") return false;
  return typeof (response as { status?: unknown }).status === "number";
}

/**
 * Returns the underlying `graphql-request` `ClientError`-shaped object if the
 * thrown error exposes one. `createClient()` normalizes raw client errors via
 * `toVexError`, preserving the original on `.cause`, so we walk that
 * chain (with a small bound) before giving up.
 */
function findGraphQLRequestError(err: unknown): GraphQLRequestError | null {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur; i++) {
    if (hasGraphQLResponse(cur)) return cur;
    cur = (cur as { cause?: unknown }).cause;
  }
  return null;
}

/** Type guard: does `err` carry a Node.js `code` (e.g. `ECONNREFUSED`), as thrown by fetch/DNS/socket failures? */
function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

/** Rewrites an absolute path under the user's home directory to start with `~`, for display. */
export function tildeify(p: string): string {
  const home = homedir();
  if (home && p.startsWith(home)) {
    return "~" + p.slice(home.length);
  }
  return p;
}

/** Masks an API key for display: first {@link API_KEY_MASK_LENGTH} chars + a fixed suffix. */
export function maskApiKey(apiKey: string): string {
  return apiKey.slice(0, API_KEY_MASK_LENGTH) + API_KEY_MASK_SUFFIX;
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
  readonly name?: string;
  readonly url?: string;
  readonly apiKey?: string;
  readonly schemaType?: "endpoint" | "file";
  readonly schemaValue?: string;
}

/** Result of an environment update — the resolved env name and the fields that changed. */
export interface UpdateEnvResult {
  readonly name: string;
  readonly updated: readonly string[];
}

/** Updates an environment's configuration. Defaults to the active environment when `name` is omitted. */
export async function updateEnvironment(input: UpdateEnvInput): Promise<UpdateEnvResult> {
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
    throw new VexError("No fields to update.", {
      hint: "Provide at least one of: --url, --api-key, --schema-type.",
    });
  }

  const config = await loadConfig();
  const targetName = input.name ?? config.activeEnvironment;
  if (!targetName) {
    throw new NoEnvironmentError(noEnvironmentMessage(config.environments));
  }

  await updateEnvConfig(targetName, fields);
  return { name: targetName, updated };
}

/** Removes an environment by name. */
export async function removeEnvironment(name: string): Promise<void> {
  await removeEnvConfig(name);
}

/** Switches the active environment. */
export async function switchEnvironment(name: string): Promise<void> {
  await switchEnvConfig(name);
}

/** Result containing all environments, the active one, and project links. */
export interface EnvListResult {
  readonly active: string;
  readonly environments: Readonly<Record<string, Environment>>;
  readonly projects: Readonly<Record<string, string>>;
}

/** Lists all configured environments and project links. */
export async function listEnvironments(): Promise<EnvListResult> {
  const config = await loadConfig();
  return {
    active: config.activeEnvironment,
    environments: config.environments,
    projects: config.projects ?? {},
  };
}

/** Input for linking a project directory to an environment. */
export interface LinkProjectInput {
  readonly envName: string;
  /** Directory to link; defaults to the current working directory. */
  readonly path?: string;
}

/** Links a project directory to an environment (defaults to cwd). */
export async function linkProjectPath(
  input: LinkProjectInput
): Promise<{ readonly envName: string; readonly path: string }> {
  const path = resolve(input.path ?? process.cwd());
  await linkProject(path, input.envName);
  return { envName: input.envName, path };
}

/** Removes the project link for a directory (defaults to cwd). */
export async function unlinkProjectPath(path?: string): Promise<{ readonly path: string }> {
  const target = resolve(path ?? process.cwd());
  await unlinkProject(target);
  return { path: target };
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
export async function checkEndpoint(env: Environment): Promise<EnvCheck> {
  const client = createClient(env);
  try {
    await client.request<{ __typename: string }>("{ __typename }");
    return { ok: true, detail: "reachable, API key accepted" };
  } catch (err: unknown) {
    const gqlErr = findGraphQLRequestError(err);
    if (gqlErr) {
      const status = gqlErr.response.status;
      const firstError = gqlErr.response.errors?.[0]?.message;
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
    throw new NoEnvironmentError(noEnvironmentMessage(config.environments));
  }
  const env = config.environments[targetName];
  if (!env) {
    throw new EnvNotFoundError(envNotFoundMessage(targetName, config.environments));
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
    throw new NoEnvironmentError(noEnvironmentMessage(config.environments));
  }
  const env = config.environments[targetName];
  if (!env) {
    throw new EnvNotFoundError(envNotFoundMessage(targetName, config.environments));
  }
  return {
    name: targetName,
    active: config.activeEnvironment === targetName,
    url: env.url,
    apiKeyMasked: maskApiKey(env.apiKey),
    schemaSource: env.schemaSource,
  };
}

/** Structured view of the environment currently in use. */
export interface CurrentEnvInfo {
  readonly name: string;
  readonly host: string;
  readonly source: EnvSource;
  readonly projectPath?: string;
}

/**
 * Resolves the environment currently in use and returns structured info
 * (never the API key). Returns `null` when nothing is configured.
 */
export async function currentEnvInfo(): Promise<CurrentEnvInfo | null> {
  let resolved;
  try {
    resolved = await getCurrentEnv();
  } catch (err) {
    if (err instanceof NoEnvironmentError) return null;
    throw err;
  }
  let host: string;
  try {
    host = new URL(resolved.env.url).host;
  } catch {
    host = resolved.env.url;
  }
  return {
    name: resolved.name,
    host,
    source: resolved.source,
    ...(resolved.projectPath !== undefined ? { projectPath: resolved.projectPath } : {}),
  };
}

/**
 * Returns a single compact line describing the environment currently in use:
 * `name → host (via …)`, or `none configured` when nothing
 * resolves. Never includes the API key.
 */
export async function currentEnvLine(): Promise<string> {
  const info = await currentEnvInfo();
  if (!info) return "none configured";
  const via =
    info.source === "param"
      ? "via env param"
      : info.source === "VEX_ENV"
        ? "via VEX_ENV"
        : info.source === "project"
          ? `via project link ${info.projectPath ?? ""}`.trim()
          : "via active";
  return `${info.name} → ${info.host} (${via})`;
}

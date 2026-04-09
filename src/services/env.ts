/**
 * @module services/env
 *
 * Environment management operations. Wraps the lower-level config functions
 * with higher-level input/output types used by CLI commands and MCP tools.
 */

import {
  addEnv as addEnvConfig,
  removeEnv as removeEnvConfig,
  switchEnv as switchEnvConfig,
  updateEnv as updateEnvConfig,
  listEnvs as listEnvsConfig,
  loadConfig,
  type Environment,
} from "../config.js";
import { refetchSchema } from "../schema.js";
import { API_KEY_MASK_LENGTH, API_KEY_MASK_SUFFIX } from "../constants.js";

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

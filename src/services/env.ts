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

export interface AddEnvInput {
  readonly name: string;
  readonly url: string;
  readonly apiKey: string;
  readonly schemaType?: "endpoint" | "file";
  readonly schemaValue?: string;
  readonly fetchSchema?: boolean;
}

export interface AddEnvResult {
  readonly name: string;
  readonly isActive: boolean;
  readonly schemaFetched: boolean;
  readonly schemaError?: string;
}

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

export interface UpdateEnvInput {
  readonly name: string;
  readonly url?: string;
  readonly apiKey?: string;
  readonly schemaType?: "endpoint" | "file";
  readonly schemaValue?: string;
}

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

export async function removeEnvironment(name: string): Promise<void> {
  await removeEnvConfig(name);
}

export async function switchEnvironment(name: string): Promise<void> {
  await switchEnvConfig(name);
}

export interface EnvListResult {
  readonly active: string;
  readonly environments: Readonly<Record<string, Environment>>;
}

export async function listEnvironments(): Promise<EnvListResult> {
  return listEnvsConfig();
}

export interface EnvShowResult {
  readonly name: string;
  readonly active: boolean;
  readonly url: string;
  readonly apiKeyMasked: string;
  readonly schemaSource?: { readonly type: string; readonly value?: string };
}

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
    apiKeyMasked: env.apiKey.slice(0, 4) + "****",
    schemaSource: env.schemaSource,
  };
}

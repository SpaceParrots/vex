/**
 * @module config
 *
 * Manages vex environment configuration persisted at `~/.vendure-vex/config.json`.
 * Supports multiple named environments, each with a Vendure API URL, API key,
 * and optional schema source. One environment is designated as "active" at a time.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";

/** Describes how to obtain the GraphQL schema for an environment. */
export interface SchemaSource {
  /** "endpoint" uses introspection; "file" reads a local SDL file. */
  type: "endpoint" | "file";
  /** The introspection URL or file path, depending on `type`. */
  value?: string;
}

/** A single Vendure Admin API connection configuration. */
export interface Environment {
  /** The Vendure Admin API GraphQL endpoint URL. */
  url: string;
  /** API key sent via the `vendure-api-key` header. */
  apiKey: string;
  /** Optional schema source for introspection or local SDL caching. */
  schemaSource?: SchemaSource;
}

/** Top-level configuration object stored on disk. */
export interface VexConfig {
  /** Name of the currently active environment (empty string if none). */
  activeEnvironment: string;
  /** Map of environment name to its configuration. */
  environments: Record<string, Environment>;
}

const CONFIG_DIR = join(homedir(), ".vendure-vex");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const SCHEMAS_DIR = join(CONFIG_DIR, "schemas");
const FRAGMENTS_DIR = join(CONFIG_DIR, "fragments");
const OPERATIONS_DIR = join(CONFIG_DIR, "operations");

function emptyConfig(): VexConfig {
  return { activeEnvironment: "", environments: {} };
}

async function ensureDirs(): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await mkdir(SCHEMAS_DIR, { recursive: true });
}

/** Loads the configuration from disk, returning an empty config if the file does not exist. */
export async function loadConfig(): Promise<VexConfig> {
  if (!existsSync(CONFIG_FILE)) {
    return emptyConfig();
  }
  const raw = await readFile(CONFIG_FILE, "utf-8");
  return JSON.parse(raw) as VexConfig;
}

/** Persists the configuration to disk, creating directories as needed. */
export async function saveConfig(config: VexConfig): Promise<void> {
  await ensureDirs();
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Returns the active environment's name and configuration.
 * Retained as the explicit "active environment only" accessor (ignores per-call overrides); most callers should use getCurrentEnv() from env-context instead.
 *
 * @throws If no active environment is set.
 */
export async function getActiveEnv(): Promise<{
  name: string;
  env: Environment;
}> {
  const config = await loadConfig();
  const name = config.activeEnvironment;
  if (!name || !config.environments[name]) {
    throw new Error(noEnvironmentMessage(config.environments));
  }
  return { name, env: config.environments[name] };
}

const ENV_NAME_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Builds a consistent "environment not found" message that lists the configured
 * environment names, so every lookup path reports the same way.
 *
 * @param name - The environment name that was not found.
 * @param environments - The configured environments map.
 * @param source - Optional resolution source (e.g. "param", "VEX_ENV") to note how the name was selected.
 */
export function envNotFoundMessage(
  name: string,
  environments: Record<string, Environment>,
  source?: string
): string {
  const available = Object.keys(environments).join(", ") || "(none)";
  const via = source ? ` (selected via ${source})` : "";
  return `Environment "${name}" not found${via}. Available: ${available}.`;
}

/**
 * Builds a consistent "no environment to act on" message. Distinguishes the
 * truly-empty case (no environments configured) from the no-selection case
 * (environments exist but none is active / named), listing available names
 * in the latter.
 */
export function noEnvironmentMessage(
  environments: Record<string, Environment>
): string {
  const names = Object.keys(environments);
  if (names.length === 0) {
    return "No environments configured. Add one with `vex env add` (or the vex_setup tool).";
  }
  return `No environment selected. Pass an explicit env name or run \`vex env switch <name>\` to set one active. Available: ${names.join(", ")}.`;
}

/**
 * Throws if the environment name contains characters that could escape the
 * per-environment directories (`schemas/<name>`, `fragments/<name>`,
 * `operations/<name>`) via path traversal.
 */
export function assertValidEnvName(name: string): void {
  if (!ENV_NAME_RE.test(name)) {
    throw new Error(
      `Environment name "${name}" must match ${ENV_NAME_RE.source} (letters, digits, underscore, dash only).`
    );
  }
}

/**
 * Adds a new environment. The first environment added is automatically set as active.
 *
 * @param name - Unique name for the environment.
 * @param env - Environment connection details.
 * @returns The updated configuration.
 * @throws If `name` contains path-unsafe characters.
 */
export async function addEnv(
  name: string,
  env: Environment
): Promise<VexConfig> {
  assertValidEnvName(name);
  const config = await loadConfig();
  const isFirst = Object.keys(config.environments).length === 0;
  const updated: VexConfig = {
    ...config,
    environments: { ...config.environments, [name]: env },
    activeEnvironment: isFirst ? name : config.activeEnvironment,
  };
  await saveConfig(updated);
  return updated;
}

/**
 * Removes an environment by name and deletes its cached schema file.
 * Clears the active environment if the removed one was active.
 *
 * @throws If the environment does not exist.
 */
export async function removeEnv(name: string): Promise<VexConfig> {
  const config = await loadConfig();
  if (!config.environments[name]) {
    throw new Error(envNotFoundMessage(name, config.environments));
  }
  const { [name]: _, ...rest } = config.environments;
  const updated: VexConfig = {
    ...config,
    environments: rest,
    activeEnvironment:
      config.activeEnvironment === name ? "" : config.activeEnvironment,
  };
  await saveConfig(updated);

  // Remove cached schema
  const schemaPath = getSchemaPath(name);
  if (existsSync(schemaPath)) {
    const { unlink } = await import("node:fs/promises");
    await unlink(schemaPath);
  }
  return updated;
}

/**
 * Partially updates an existing environment's configuration fields.
 *
 * @param name - Name of the environment to update.
 * @param fields - Fields to merge into the existing configuration.
 * @throws If the environment does not exist.
 */
export async function updateEnv(
  name: string,
  fields: Partial<Environment>
): Promise<VexConfig> {
  const config = await loadConfig();
  const existing = config.environments[name];
  if (!existing) {
    throw new Error(envNotFoundMessage(name, config.environments));
  }
  const updated: VexConfig = {
    ...config,
    environments: {
      ...config.environments,
      [name]: { ...existing, ...fields },
    },
  };
  await saveConfig(updated);
  return updated;
}

/**
 * Switches the active environment to the specified name.
 *
 * @throws If the environment does not exist.
 */
export async function switchEnv(name: string): Promise<VexConfig> {
  const config = await loadConfig();
  if (!config.environments[name]) {
    throw new Error(envNotFoundMessage(name, config.environments));
  }
  const updated: VexConfig = { ...config, activeEnvironment: name };
  await saveConfig(updated);
  return updated;
}

/** Returns all environments and the name of the currently active one. */
export async function listEnvs(): Promise<{
  active: string;
  environments: Record<string, Environment>;
}> {
  const config = await loadConfig();
  return {
    active: config.activeEnvironment,
    environments: config.environments,
  };
}

/** Returns the file path where a given environment's cached schema is stored. */
export function getSchemaPath(envName: string): string {
  return join(SCHEMAS_DIR, `${envName}.graphql`);
}

/**
 * Returns the directory where fragments for the given environment are stored.
 * The per-environment subdirectory is not pre-created — callers writing to it
 * must `mkdir(..., { recursive: true })` first.
 */
export function getFragmentsDir(envName: string): string {
  return join(FRAGMENTS_DIR, envName);
}

/**
 * Returns the directory where saved operations (full query/mutation documents
 * with default variables) for the given environment are stored. The directory
 * is not pre-created — callers writing to it must `mkdir(..., { recursive: true })`
 * first.
 */
export function getOperationsDir(envName: string): string {
  return join(OPERATIONS_DIR, envName);
}

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";

export interface SchemaSource {
  type: "endpoint" | "file";
  value?: string;
}

export interface Environment {
  url: string;
  apiKey: string;
  schemaSource?: SchemaSource;
}

export interface VexConfig {
  activeEnvironment: string;
  environments: Record<string, Environment>;
}

const CONFIG_DIR = join(homedir(), ".vendure-vex");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const SCHEMAS_DIR = join(CONFIG_DIR, "schemas");

function emptyConfig(): VexConfig {
  return { activeEnvironment: "", environments: {} };
}

async function ensureDirs(): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await mkdir(SCHEMAS_DIR, { recursive: true });
}

export async function loadConfig(): Promise<VexConfig> {
  if (!existsSync(CONFIG_FILE)) {
    return emptyConfig();
  }
  const raw = await readFile(CONFIG_FILE, "utf-8");
  return JSON.parse(raw) as VexConfig;
}

export async function saveConfig(config: VexConfig): Promise<void> {
  await ensureDirs();
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

export async function getActiveEnv(): Promise<{
  name: string;
  env: Environment;
}> {
  const config = await loadConfig();
  const name = config.activeEnvironment;
  if (!name || !config.environments[name]) {
    throw new Error(
      "No active environment configured. Use the vendure_setup tool to add one."
    );
  }
  return { name, env: config.environments[name] };
}

export async function addEnv(
  name: string,
  env: Environment
): Promise<VexConfig> {
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

export async function removeEnv(name: string): Promise<VexConfig> {
  const config = await loadConfig();
  if (!config.environments[name]) {
    throw new Error(`Environment "${name}" not found.`);
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

export async function switchEnv(name: string): Promise<VexConfig> {
  const config = await loadConfig();
  if (!config.environments[name]) {
    throw new Error(`Environment "${name}" not found.`);
  }
  const updated: VexConfig = { ...config, activeEnvironment: name };
  await saveConfig(updated);
  return updated;
}

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

export function getSchemaPath(envName: string): string {
  return join(SCHEMAS_DIR, `${envName}.graphql`);
}

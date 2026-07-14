/**
 * @module context
 *
 * Workspace context: per-call environment resolution answering "which env,
 * and why" for every call path (CLI, MCP tool, service). Holds an optional
 * override env name in an AsyncLocalStorage for the duration of a single
 * tool/CLI call and resolves the effective environment via the precedence
 * chain:
 *
 *   explicit override > VEX_ENV > project link matching cwd > active env
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { resolve, dirname } from "node:path";
import {
  loadConfig,
  assertValidEnvName,
  envNotFoundMessage,
  noEnvironmentMessage,
  normalizeProjectPath,
  GETTING_STARTED_HINT,
  type Environment,
} from "./config.js";
import { NoEnvironmentError, EnvNotFoundError } from "./errors.js";

// Re-exported so existing `import { NoEnvironmentError } from "./context.js"` sites work.
export { NoEnvironmentError };

/** Where a resolved environment name came from. */
export type EnvSource = "param" | "VEX_ENV" | "project" | "active";

/** A fully resolved environment plus the source that selected it. */
export interface WorkspaceContext {
  readonly name: string;
  readonly env: Environment;
  readonly source: EnvSource;
  /** The linked project path that selected this env (only when source === "project"). */
  readonly projectPath?: string;
}

/** Back-compat alias for the pre-project-links name of {@link WorkspaceContext}. */
export type ResolvedEnv = WorkspaceContext;

const storage = new AsyncLocalStorage<string | undefined>();

/** Runs `fn` with `envName` as the ambient override for the duration of the call. */
export function withEnv<T>(envName: string | undefined, fn: () => Promise<T>): Promise<T> {
  return storage.run(envName, fn);
}

/**
 * Sets the ambient override for the current async execution without a callback.
 * Used by the CLI `preAction` hook, where the action runs after the hook returns.
 * No-op when `envName` is undefined so the chain falls through.
 */
export function enterEnvContext(envName: string | undefined): void {
  if (envName !== undefined) storage.enterWith(envName);
}

/** Returns the current ambient override, if any. */
export function getEnvOverride(): string | undefined {
  return storage.getStore();
}

/**
 * Finds the project link whose path equals `cwd` or is an ancestor of it.
 * Walking up from `cwd` returns the deepest (longest) matching link first.
 * Comparison uses {@link normalizeProjectPath} (case-insensitive on Windows).
 */
export function findProjectLink(
  projects: Readonly<Record<string, string>> | undefined,
  cwd: string
): { readonly path: string; readonly envName: string } | undefined {
  if (!projects || Object.keys(projects).length === 0) return undefined;
  const byNorm = new Map(
    Object.entries(projects).map(([path, envName]) => [normalizeProjectPath(path), { path, envName }])
  );
  let candidate = resolve(cwd);
  for (;;) {
    const hit = byNorm.get(normalizeProjectPath(candidate));
    if (hit) return hit;
    const parent = dirname(candidate);
    if (parent === candidate) return undefined;
    candidate = parent;
  }
}

/**
 * Resolves the effective environment via precedence:
 * explicit `override` > `VEX_ENV` > project link matching cwd > active env.
 *
 * @throws {NoEnvironmentError} If nothing resolves.
 * @throws {EnvNotFoundError} If the resolved name is not configured.
 */
export async function resolveEnv(override?: string): Promise<WorkspaceContext> {
  const config = await loadConfig();

  let name: string;
  let source: EnvSource;
  let projectPath: string | undefined;
  const projectHit = findProjectLink(config.projects, process.cwd());

  if (override) {
    name = override;
    source = "param";
  } else if (process.env.VEX_ENV) {
    name = process.env.VEX_ENV;
    source = "VEX_ENV";
  } else if (projectHit) {
    name = projectHit.envName;
    source = "project";
    projectPath = projectHit.path;
  } else if (config.activeEnvironment) {
    name = config.activeEnvironment;
    source = "active";
  } else {
    throw new NoEnvironmentError(noEnvironmentMessage(config.environments), {
      hint: Object.keys(config.environments).length === 0 ? GETTING_STARTED_HINT : undefined,
    });
  }

  assertValidEnvName(name);

  const env = config.environments[name];
  if (!env) {
    throw new EnvNotFoundError(envNotFoundMessage(name, config.environments, source));
  }

  return { name, env, source, ...(projectPath !== undefined ? { projectPath } : {}) };
}

/** Resolves the environment for the current call, honoring any ambient override. */
export function getCurrentEnv(): Promise<WorkspaceContext> {
  return resolveEnv(getEnvOverride());
}

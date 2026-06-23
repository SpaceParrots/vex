/**
 * @module env-context
 *
 * Per-call environment resolution. Holds an optional "override" env name in an
 * AsyncLocalStorage for the duration of a single tool/CLI call, and resolves the
 * effective environment via the precedence chain:
 *
 *   explicit override  >  VEX_ENV  >  global activeEnvironment
 */

import { AsyncLocalStorage } from "node:async_hooks";
import {
  loadConfig,
  assertValidEnvName,
  envNotFoundMessage,
  noEnvironmentMessage,
  type Environment,
} from "./config.js";

/** Thrown when no environment can be resolved at all (none configured / no default). */
export class NoEnvironmentError extends Error {}

/** Where a resolved environment name came from. */
export type EnvSource = "param" | "VEX_ENV" | "active";

/** A fully resolved environment plus the source that selected it. */
export interface ResolvedEnv {
  readonly name: string;
  readonly env: Environment;
  readonly source: EnvSource;
}

const storage = new AsyncLocalStorage<string | undefined>();

/** Runs `fn` with `envName` as the ambient override for the duration of the call. */
export function withEnv<T>(
  envName: string | undefined,
  fn: () => Promise<T>
): Promise<T> {
  return storage.run(envName, fn);
}

/**
 * Sets the ambient override for the current async execution without a callback.
 * Used by the CLI `preAction` hook, where the action runs after the hook returns.
 * No-op when `envName` is undefined so the chain falls through to VEX_ENV/active.
 */
export function enterEnvContext(envName: string | undefined): void {
  if (envName !== undefined) storage.enterWith(envName);
}

/** Returns the current ambient override, if any. */
export function getEnvOverride(): string | undefined {
  return storage.getStore();
}

/**
 * Resolves the effective environment via precedence:
 * explicit `override` > `VEX_ENV` > global `activeEnvironment`.
 *
 * @throws If nothing resolves, or the resolved name is invalid / not configured.
 */
export async function resolveEnv(override?: string): Promise<ResolvedEnv> {
  const config = await loadConfig();

  let name: string;
  let source: EnvSource;
  if (override) {
    name = override;
    source = "param";
  } else if (process.env.VEX_ENV) {
    name = process.env.VEX_ENV;
    source = "VEX_ENV";
  } else if (config.activeEnvironment) {
    name = config.activeEnvironment;
    source = "active";
  } else {
    throw new NoEnvironmentError(noEnvironmentMessage(config.environments));
  }

  assertValidEnvName(name);

  const env = config.environments[name];
  if (!env) {
    throw new Error(envNotFoundMessage(name, config.environments, source));
  }

  return { name, env, source };
}

/** Resolves the environment for the current call, honoring any ambient override. */
export function getCurrentEnv(): Promise<ResolvedEnv> {
  return resolveEnv(getEnvOverride());
}

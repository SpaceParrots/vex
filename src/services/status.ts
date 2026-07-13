/**
 * @module services/status
 *
 * Aggregated `vex status` report: which environment is in use (and why),
 * endpoint reachability with latency, schema-cache freshness, and config
 * location. Read side only — never mutates config.
 */

import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { getCurrentEnv, type EnvSource } from "../context.js";
import { getSchemaPath, getConfigPath } from "../config.js";
import { checkEndpoint, maskApiKey, tildeify } from "./env.js";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json") as { version: string };

/** Aggregated health/status view for the resolved environment. */
export interface StatusReport {
  readonly version: string;
  readonly envName: string;
  readonly source: EnvSource;
  readonly projectPath?: string;
  readonly url: string;
  readonly apiKeyMasked: string;
  readonly endpoint: { readonly ok: boolean; readonly detail: string; readonly latencyMs: number };
  readonly schema: { readonly cached: boolean; readonly detail: string };
  readonly configPath: string;
}

/** Formats a millisecond age as a compact human string (e.g. "2 days ago"). Clamps negative ages (e.g. a future mtime) to 0. */
function formatAge(ms: number): string {
  const clamped = Math.max(0, ms);
  const minutes = Math.floor(clamped / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * Builds the aggregated status report for the currently resolved environment.
 *
 * @throws {NoEnvironmentError} When nothing resolves (the CLI presenter turns
 *   this into the getting-started hint).
 */
export async function statusReport(): Promise<StatusReport> {
  const ctx = await getCurrentEnv();

  const started = Date.now();
  const endpoint = await checkEndpoint(ctx.env);
  const latencyMs = Date.now() - started;

  const schemaPath = getSchemaPath(ctx.name);
  let schema: StatusReport["schema"];
  if (existsSync(schemaPath)) {
    const info = await stat(schemaPath);
    schema = {
      cached: true,
      detail: `cached ${formatAge(Date.now() - info.mtimeMs)} (${tildeify(schemaPath)})`,
    };
  } else {
    schema = { cached: false, detail: "not cached — run `vex schema fetch`" };
  }

  return {
    version,
    envName: ctx.name,
    source: ctx.source,
    ...(ctx.projectPath !== undefined ? { projectPath: ctx.projectPath } : {}),
    url: ctx.env.url,
    apiKeyMasked: maskApiKey(ctx.env.apiKey),
    endpoint: { ...endpoint, latencyMs },
    schema,
    configPath: tildeify(getConfigPath()),
  };
}

/**
 * @module services/mcp-config
 *
 * Pure builders for the `vex mcp install` / `vex mcp config` commands:
 * constructing the vex MCP server entry and merging it into an existing
 * `.mcp.json` document without disturbing other servers or unknown keys.
 * No filesystem access here — the command layer reads/writes the file.
 */

import { ConfigError } from "../errors.js";
import { isRecord } from "../guards.js";

/** The `mcpServers.vex` entry written into `.mcp.json`. */
export interface VexServerEntry {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

/** Choices gathered by the installer (flags or interactive prompts). */
export interface McpInstallOptions {
  /** Environment pinned via VEX_ENV in the server entry. */
  readonly envName: string;
  /** Tool surface: "lean" (default, 6 tools) or "full" (all tools). */
  readonly tools: "full" | "lean";
  /** Invoke via `npx -y @spaceparrots/vex` instead of a global `vex` binary. */
  readonly useNpx: boolean;
}

/** Builds the vex MCP server entry for the chosen invocation style and env. */
export function buildVexServerEntry(opts: McpInstallOptions): VexServerEntry {
  const base = opts.useNpx
    ? { command: "npx", args: ["-y", "@spaceparrots/vex", "serve"] as const }
    : { command: "vex", args: ["serve"] as const };
  return { ...base, env: { VEX_ENV: opts.envName, VEX_TOOLS: opts.tools } };
}

/**
 * Parses `existingText` as a JSON object, throwing a {@link ConfigError} with
 * an actionable hint if it is not valid JSON or not an object at the root.
 */
function parseRoot(existingText: string): Record<string, unknown> {
  let root: unknown;
  try {
    root = JSON.parse(existingText);
  } catch {
    throw new ConfigError(".mcp.json exists but is not valid JSON.", {
      hint: "Fix or delete the file, then re-run `vex mcp install`.",
    });
  }
  if (!isRecord(root)) {
    throw new ConfigError(".mcp.json must contain a JSON object at the root.", {
      hint: "Fix or delete the file, then re-run `vex mcp install`.",
    });
  }
  return root;
}

/**
 * Merges the vex server entry into an existing `.mcp.json` document (or
 * starts a fresh one), preserving all other servers and unknown root keys.
 * Returns pretty-printed JSON with a trailing newline.
 *
 * @throws {ConfigError} If `existingText` is not a JSON object.
 */
export function mergeMcpJson(existingText: string | undefined, entry: VexServerEntry): string {
  const root = existingText?.trim() ? parseRoot(existingText) : {};
  const servers = isRecord(root.mcpServers) ? root.mcpServers : {};
  const merged = { ...root, mcpServers: { ...servers, vex: entry } };
  return JSON.stringify(merged, null, 2) + "\n";
}

/**
 * Returns the current `mcpServers.vex` entry from an `.mcp.json` document, or
 * `undefined` when the file/entry is absent. Reuses {@link parseRoot} for
 * validation (same null/object/array checks as {@link mergeMcpJson}) rather
 * than parsing the file a second, unguarded way; invalid JSON or a
 * non-object root is caught here and reported as `undefined` too — the merge
 * step is what surfaces that as a proper {@link ConfigError} to the user.
 */
export function getExistingVexEntry(existingText: string | undefined): unknown {
  if (!existingText?.trim()) return undefined;
  let root: Record<string, unknown>;
  try {
    root = parseRoot(existingText);
  } catch (err) {
    if (err instanceof ConfigError) return undefined;
    throw err;
  }
  return isRecord(root.mcpServers) ? root.mcpServers.vex : undefined;
}

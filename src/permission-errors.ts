/**
 * @module permission-errors
 *
 * Schema-aware enrichment of {@link PermissionError}s: names the operation
 * that was denied and suggests the likely required `Permission` values from
 * the environment's cached schema. Reads only the local cache file — never
 * the network — and degrades gracefully (returns the original error) when
 * anything is missing. Must not import client, schema, or services (cycle).
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { getSchemaPath } from "./config.js";
import { PermissionError, type VexError } from "./errors.js";
import {
  parsePermissions,
  suggestPermissions,
  extractOperationField,
} from "./schema-model/permissions.js";

/**
 * Upgrades a {@link PermissionError} with the denied operation's name and
 * likely required permissions. Non-permission errors, missing schema caches,
 * and any internal failure return the input error unchanged.
 *
 * @param err - The normalized error from a failed request.
 * @param envName - Environment name (locates the schema cache).
 * @param document - The GraphQL document that was executed.
 */
export async function enrichPermissionError(
  err: VexError,
  envName: string,
  document: string
): Promise<VexError> {
  if (!(err instanceof PermissionError)) return err;
  try {
    const schemaPath = getSchemaPath(envName);
    if (!existsSync(schemaPath)) return err;
    const sdl = await readFile(schemaPath, "utf-8");
    const operationName = extractOperationField(document);
    if (!operationName) return err;

    const suggested = suggestPermissions(operationName, parsePermissions(sdl));
    const hintLines = [
      suggested.length > 0
        ? `The API key's roles likely lack: ${suggested.join(" or ")}.`
        : "The API key's roles lack a required permission.",
      "Fix: assign the permission to the key's role in the Vendure admin UI,",
      "     or list all permissions with `vex schema permissions`.",
    ];
    return new PermissionError(`Permission denied for \`${operationName}\` on env "${envName}".`, {
      status: err.status,
      errors: err.errors,
      cause: (err as Error & { cause?: unknown }).cause ?? err,
      operationName,
      suggestedPermissions: suggested,
      hint: hintLines.join("\n"),
    });
  } catch {
    return err;
  }
}

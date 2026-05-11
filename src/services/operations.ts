/**
 * @module services/operations
 *
 * Per-environment storage for fully-baked GraphQL operations: a saved operation
 * is the rendered document plus its default variables. Files live at
 * `~/.vendure-vex/operations/{envName}/{Name}.json` so that a future `vex run`
 * can replay the call with optional variable overrides.
 */

import { readFile, writeFile, rename, mkdir, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parse, type DocumentNode, type OperationDefinitionNode } from "graphql";
import { getOperationsDir } from "../config.js";
import { SENSITIVE_VAR_NAME_RE } from "../constants.js";

let rootOverride: string | null = null;

/** Test hook: redirect the operations root directory. */
export function setOperationsRootForTests(root: string | null): void {
  rootOverride = root;
}

function envDir(envName: string): string {
  if (rootOverride) return join(rootOverride, envName);
  return getOperationsDir(envName);
}

const NAME_RE = /^[A-Za-z][A-Za-z0-9]*$/;
const ENV_NAME_RE = /^[A-Za-z0-9_-]+$/;
const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Throws if the operation name does not match the safe identifier pattern. */
function assertValidName(name: string): void {
  if (!NAME_RE.test(name)) {
    throw new Error(`Operation name "${name}" must match ${NAME_RE.source}.`);
  }
}

/** Throws if the environment name could escape the operations directory. */
function assertValidEnvName(envName: string): void {
  if (!ENV_NAME_RE.test(envName)) {
    throw new Error(
      `Environment name "${envName}" must match ${ENV_NAME_RE.source} (path-safe characters only).`
    );
  }
}

/** Throws if any key in `obj` is a JavaScript reserved key that could pollute Object.prototype. */
function assertNoReservedKeys(obj: Record<string, unknown>, context: string): void {
  for (const key of Object.keys(obj)) {
    if (RESERVED_KEYS.has(key)) {
      throw new Error(`Reserved key "${key}" is not allowed in ${context}.`);
    }
  }
}

/**
 * Returns top-level keys in `variables` that look like they hold a secret.
 * Recurses one level into nested objects so that e.g. `{ input: { password } }`
 * is also caught. Callers should surface these to the user before persisting
 * the operation, since saved-operation files live unencrypted on disk.
 */
export function detectSensitiveKeys(
  variables: Readonly<Record<string, unknown>>
): readonly string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(variables)) {
    if (SENSITIVE_VAR_NAME_RE.test(k)) out.push(k);
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const nestedKey of Object.keys(v as Record<string, unknown>)) {
        if (SENSITIVE_VAR_NAME_RE.test(nestedKey)) out.push(`${k}.${nestedKey}`);
      }
    }
  }
  return out;
}

/** On-disk shape of a saved operation. */
export interface SavedOperation {
  readonly name: string;
  readonly kind: "query" | "mutation";
  readonly rootField: string;
  readonly document: string;
  readonly variables: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Lightweight metadata for list views. */
export interface OperationMeta {
  readonly name: string;
  readonly kind: "query" | "mutation";
  readonly rootField: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly path: string;
}

export interface SaveOperationInput {
  readonly envName: string;
  readonly name: string;
  readonly kind: "query" | "mutation";
  readonly rootField: string;
  readonly document: string;
  /**
   * Variables to persist alongside the document. Stored unencrypted at
   * `~/.vendure-vex/operations/<env>/<Name>.json` — do not pass credentials,
   * passwords, or PII unless you accept that risk. See `detectSensitiveKeys`.
   */
  readonly variables: Readonly<Record<string, unknown>>;
  readonly overwrite?: boolean;
}

function extractOperation(doc: DocumentNode): OperationDefinitionNode {
  const ops = doc.definitions.filter(
    (d): d is OperationDefinitionNode => d.kind === "OperationDefinition"
  );
  if (ops.length !== 1) {
    throw new Error(`Document must contain exactly one operation definition (found ${ops.length}).`);
  }
  return ops[0];
}

function operationPath(envName: string, name: string): string {
  return join(envDir(envName), `${name}.json`);
}

/**
 * Persists a built operation. Validates the name and the document's syntactic
 * shape (one operation, matching `kind`), then atomically writes a JSON record.
 *
 * @throws If `input.name` is invalid, the document is unparseable, the kind
 *   mismatches, or the file exists and `overwrite` is not set.
 */
export async function saveOperation(input: SaveOperationInput): Promise<OperationMeta> {
  assertValidEnvName(input.envName);
  assertValidName(input.name);
  assertNoReservedKeys(input.variables as Record<string, unknown>, "operation variables");

  // Parse to validate the document is well-formed and the kind matches.
  const doc = parse(input.document);
  const op = extractOperation(doc);
  if (op.operation !== input.kind) {
    throw new Error(
      `Document is a ${op.operation} but kind is "${input.kind}".`
    );
  }

  const dir = envDir(input.envName);
  await mkdir(dir, { recursive: true });
  const finalPath = operationPath(input.envName, input.name);

  const now = new Date().toISOString();
  let createdAt = now;
  if (existsSync(finalPath)) {
    if (!input.overwrite) {
      throw new Error(`Operation "${input.name}" already exists. Pass overwrite:true to replace.`);
    }
    try {
      const prev = JSON.parse(await readFile(finalPath, "utf-8")) as SavedOperation;
      if (prev.createdAt) createdAt = prev.createdAt;
    } catch {
      // Existing file is unreadable; treat as fresh save.
    }
  }

  const record: SavedOperation = {
    name: input.name,
    kind: input.kind,
    rootField: input.rootField,
    document: input.document,
    variables: input.variables,
    createdAt,
    updatedAt: now,
  };

  const tmpPath = `${finalPath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(record, null, 2), "utf-8");
  await rename(tmpPath, finalPath);

  return {
    name: record.name,
    kind: record.kind,
    rootField: record.rootField,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    path: finalPath,
  };
}

export interface LoadOperationInput {
  readonly envName: string;
  readonly name: string;
}

/** Loads a saved operation by name and validates the on-disk shape before returning. */
export async function loadOperation(input: LoadOperationInput): Promise<SavedOperation> {
  assertValidEnvName(input.envName);
  assertValidName(input.name);
  const path = operationPath(input.envName, input.name);
  if (!existsSync(path)) {
    throw new Error(`Operation "${input.name}" not found at ${path}.`);
  }
  const raw = await readFile(path, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Saved operation "${input.name}" is not valid JSON: ${(err as Error).message}`);
  }
  return assertSavedOperationShape(parsed, input.name);
}

function assertSavedOperationShape(value: unknown, name: string): SavedOperation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Saved operation "${name}" is malformed (expected an object).`);
  }
  const v = value as Record<string, unknown>;
  const expect = (key: string, want: string): void => {
    if (typeof v[key] !== want) {
      throw new Error(`Saved operation "${name}" is missing or has wrong type for "${key}".`);
    }
  };
  expect("name", "string");
  expect("kind", "string");
  expect("rootField", "string");
  expect("document", "string");
  expect("createdAt", "string");
  expect("updatedAt", "string");
  if (v.kind !== "query" && v.kind !== "mutation") {
    throw new Error(`Saved operation "${name}" has invalid kind "${String(v.kind)}".`);
  }
  if (!v.variables || typeof v.variables !== "object" || Array.isArray(v.variables)) {
    throw new Error(`Saved operation "${name}" has invalid variables (expected an object).`);
  }
  assertNoReservedKeys(v.variables as Record<string, unknown>, "saved variables");
  return v as unknown as SavedOperation;
}

export interface ListOperationsInput {
  readonly envName: string;
  readonly kind?: "query" | "mutation";
  readonly rootField?: string;
}

async function readMeta(filePath: string): Promise<OperationMeta | null> {
  const raw = await readFile(filePath, "utf-8");
  try {
    const rec = JSON.parse(raw) as SavedOperation;
    return {
      name: rec.name,
      kind: rec.kind,
      rootField: rec.rootField,
      createdAt: rec.createdAt,
      updatedAt: rec.updatedAt,
      path: filePath,
    };
  } catch {
    return null;
  }
}

/** Lists saved operations for an environment, optionally filtered by kind or rootField. */
export async function listOperations(input: ListOperationsInput): Promise<readonly OperationMeta[]> {
  const dir = envDir(input.envName);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  const out: OperationMeta[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const meta = await readMeta(join(dir, entry));
    if (!meta) continue;
    if (input.kind && meta.kind !== input.kind) continue;
    if (input.rootField && meta.rootField !== input.rootField) continue;
    out.push(meta);
  }
  // Stable order: most recently updated first.
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export interface DeleteOperationInput {
  readonly envName: string;
  readonly name: string;
}

/** Deletes a saved operation. Returns `{ deleted: false }` if the file did not exist. */
export async function deleteOperation(
  input: DeleteOperationInput
): Promise<{ deleted: true; path: string } | { deleted: false; reason: string }> {
  assertValidEnvName(input.envName);
  assertValidName(input.name);
  const path = operationPath(input.envName, input.name);
  if (!existsSync(path)) return { deleted: false, reason: "not found" };
  await unlink(path);
  return { deleted: true, path };
}

/**
 * Merges variable overrides into a saved operation's defaults. Top-level keys
 * from `overrides` replace defaults; nested objects are not deep-merged so that
 * partial-shape overrides cannot silently produce malformed variables. Reserved
 * JS keys (`__proto__`, `constructor`, `prototype`) are rejected to prevent
 * prototype pollution.
 */
export function mergeVariables(
  defaults: Readonly<Record<string, unknown>>,
  overrides: Readonly<Record<string, unknown>>
): Record<string, unknown> {
  assertNoReservedKeys(defaults as Record<string, unknown>, "defaults");
  assertNoReservedKeys(overrides as Record<string, unknown>, "overrides");
  const out = Object.create(null) as Record<string, unknown>;
  for (const [k, v] of Object.entries(defaults)) out[k] = v;
  for (const [k, v] of Object.entries(overrides)) out[k] = v;
  return out;
}

/**
 * Parses `--var key=value` CLI pairs into a record. The value is JSON-parsed
 * when it parses (so booleans/numbers/objects/arrays come through correctly),
 * otherwise it is kept as the raw string. Reserved JS keys are rejected to
 * prevent prototype pollution via attacker-controlled `--var __proto__=...`.
 *
 * @throws If any pair is missing the `=` separator or uses a reserved key.
 */
export function parseVarPairs(pairs: readonly string[]): Record<string, unknown> {
  const out = Object.create(null) as Record<string, unknown>;
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq <= 0) {
      throw new Error(`Invalid --var "${pair}". Expected key=value.`);
    }
    const key = pair.slice(0, eq);
    if (RESERVED_KEYS.has(key)) {
      throw new Error(`Reserved key "${key}" is not allowed in --var.`);
    }
    const raw = pair.slice(eq + 1);
    try {
      out[key] = JSON.parse(raw);
    } catch {
      out[key] = raw;
    }
  }
  return out;
}

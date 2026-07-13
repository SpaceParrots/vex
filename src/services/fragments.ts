/**
 * @module services/fragments
 *
 * Per-environment GraphQL fragment storage. Files live at
 * `~/.vendure-vex/fragments/{envName}/{Name}.graphql` and contain a single
 * `fragment Name on Type { ... }` definition.
 */

import { readFile, writeFile, rename, mkdir, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  parse,
  GraphQLObjectType,
  GraphQLInterfaceType,
  GraphQLUnionType,
  GraphQLNonNull,
  GraphQLList,
  type DocumentNode,
  type FragmentDefinitionNode,
  type GraphQLSchema,
  type SelectionSetNode,
} from "graphql";
import { getFragmentsDir } from "../config.js";
import type { Selection } from "../schema-model/types.js";

let rootOverride: string | null = null;

/** Test hook: redirect the fragments root directory. */
export function setFragmentsRootForTests(root: string | null): void {
  rootOverride = root;
}

/** Resolves the on-disk directory for an environment's saved fragments. */
function envDir(envName: string): string {
  if (rootOverride) return join(rootOverride, envName);
  return getFragmentsDir(envName);
}

/** Summary of a saved fragment, as returned by list operations. */
export interface FragmentMeta {
  readonly name: string;
  readonly onType: string;
  readonly fields: number;
  readonly path: string;
}

/** Input for {@link saveFragment}. */
export interface SaveFragmentInput {
  readonly envName: string;
  readonly name: string;
  readonly sdl: string;
  readonly schema: GraphQLSchema;
  readonly overwrite?: boolean;
}

const NAME_RE = /^[A-Za-z][A-Za-z0-9]*$/;
const ENV_NAME_RE = /^[A-Za-z0-9_-]+$/;

/** Throws if the fragment name does not match the safe identifier pattern. */
function assertValidName(name: string): void {
  if (!NAME_RE.test(name)) {
    throw new Error(`Fragment name "${name}" must match ${NAME_RE.source}.`);
  }
}

/** Throws if the environment name could escape the fragments directory. */
function assertValidEnvName(envName: string): void {
  if (!ENV_NAME_RE.test(envName)) {
    throw new Error(
      `Environment name "${envName}" must match ${ENV_NAME_RE.source} (path-safe characters only).`
    );
  }
}

/**
 * Pulls the single fragment definition out of a parsed document.
 *
 * @throws If `doc` contains zero or more than one fragment definition.
 */
function extractFragmentDef(doc: DocumentNode): FragmentDefinitionNode {
  const defs = doc.definitions.filter(
    (d): d is FragmentDefinitionNode => d.kind === "FragmentDefinition"
  );
  if (defs.length !== 1) {
    throw new Error(`SDL must contain exactly one fragment definition (found ${defs.length}).`);
  }
  return defs[0];
}

/** Strips `NonNull`/`List` wrappers to get at the underlying named GraphQL type. */
// Use instanceof — no `as unknown as` casts.
function unwrapToNamed(t: unknown): unknown {
  let cur: unknown = t;
  while (cur instanceof GraphQLNonNull || cur instanceof GraphQLList) {
    cur = cur.ofType;
  }
  return cur;
}

/**
 * Recursively checks that every field and inline fragment in `selectionSet`
 * exists on `parentType` (or, for inline fragments, on the referenced type).
 * `FragmentSpread` nodes are intentionally not checked — see the inline
 * comment below.
 *
 * @param pathPrefix - Dotted type/field path used to make error messages
 *   point at the offending location, e.g. `Order.lines`.
 * @throws If a field is missing, a union is selected directly, or an inline
 *   fragment targets an unknown or non-composite type.
 */
function validateSelectionAgainst(
  parentType: GraphQLObjectType | GraphQLInterfaceType | GraphQLUnionType,
  selectionSet: SelectionSetNode,
  schema: GraphQLSchema,
  pathPrefix: string
): void {
  for (const sel of selectionSet.selections) {
    if (sel.kind === "Field") {
      const fieldName = sel.name.value;
      if (fieldName === "__typename") continue;

      if (parentType instanceof GraphQLUnionType) {
        throw new Error(
          `Field "${fieldName}" cannot be selected directly on union "${parentType.name}" at ${pathPrefix}.`
        );
      }

      const fieldDef = parentType.getFields()[fieldName];
      if (!fieldDef) {
        throw new Error(
          `Field "${fieldName}" does not exist on type "${parentType.name}" at ${pathPrefix}.`
        );
      }
      if (sel.selectionSet) {
        const inner = unwrapToNamed(fieldDef.type);
        if (
          inner instanceof GraphQLObjectType ||
          inner instanceof GraphQLInterfaceType ||
          inner instanceof GraphQLUnionType
        ) {
          validateSelectionAgainst(inner, sel.selectionSet, schema, `${pathPrefix}.${fieldName}`);
        }
      }
    } else if (sel.kind === "InlineFragment") {
      const tName = sel.typeCondition?.name.value;
      if (!tName) continue;
      const t = schema.getType(tName);
      if (
        !(t instanceof GraphQLObjectType) &&
        !(t instanceof GraphQLInterfaceType) &&
        !(t instanceof GraphQLUnionType)
      ) {
        throw new Error(`Inline fragment refers to unknown or non-composite type "${tName}".`);
      }
      validateSelectionAgainst(t, sel.selectionSet, schema, `${pathPrefix}(${tName})`);
    }
    // FragmentSpread is intentionally unchecked here — the loader resolves spreads at
    // load time, so a spread to a fragment that does not yet exist is not a save-time error.
  }
}

/**
 * Validates and persists a fragment's SDL to
 * `~/.vendure-vex/fragments/{envName}/{name}.graphql`, writing via a
 * temp-file-then-rename to avoid leaving a partial file on crash.
 *
 * @throws If `input.envName`/`input.name` are unsafe, the SDL doesn't parse
 *   to exactly one fragment matching `input.name`, its type condition isn't
 *   an object/interface/union, a selected field doesn't exist on that type,
 *   or the file already exists and `input.overwrite` is not set.
 */
export async function saveFragment(input: SaveFragmentInput): Promise<{
  name: string;
  onType: string;
  path: string;
}> {
  assertValidEnvName(input.envName);
  assertValidName(input.name);

  const doc = parse(input.sdl);
  const def = extractFragmentDef(doc);
  if (def.name.value !== input.name) {
    throw new Error(
      `Fragment name in SDL ("${def.name.value}") does not match requested name ("${input.name}").`
    );
  }
  const onType = def.typeCondition.name.value;
  const t = input.schema.getType(onType);
  if (
    !(t instanceof GraphQLObjectType) &&
    !(t instanceof GraphQLInterfaceType) &&
    !(t instanceof GraphQLUnionType)
  ) {
    throw new Error(`Type "${onType}" must be an object, interface, or union.`);
  }
  validateSelectionAgainst(t, def.selectionSet, input.schema, onType);

  const dir = envDir(input.envName);
  await mkdir(dir, { recursive: true });
  const finalPath = join(dir, `${input.name}.graphql`);
  if (existsSync(finalPath) && !input.overwrite) {
    throw new Error(`Fragment "${input.name}" already exists. Pass overwrite:true to replace.`);
  }
  const tmpPath = `${finalPath}.tmp`;
  await writeFile(tmpPath, input.sdl, "utf-8");
  await rename(tmpPath, finalPath);

  return { name: input.name, onType, path: finalPath };
}

/** Input for {@link listFragments}. */
export interface ListFragmentsInput {
  readonly envName: string;
  readonly onType?: string;
}

/** Reads and parses a fragment file into its {@link FragmentMeta} summary. */
async function readMeta(filePath: string): Promise<FragmentMeta | null> {
  // Filesystem errors propagate; only parse / shape errors yield null so that
  // a malformed file is silently skipped while a disk error surfaces to the user.
  const sdl = await readFile(filePath, "utf-8");
  try {
    const doc = parse(sdl);
    const def = extractFragmentDef(doc);
    return {
      name: def.name.value,
      onType: def.typeCondition.name.value,
      fields: def.selectionSet.selections.length,
      path: filePath,
    };
  } catch {
    return null;
  }
}

/** Lists saved fragments for an environment, optionally filtered by `onType`. */
export async function listFragments(input: ListFragmentsInput): Promise<readonly FragmentMeta[]> {
  assertValidEnvName(input.envName);
  const dir = envDir(input.envName);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  const out: FragmentMeta[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".graphql")) continue;
    const meta = await readMeta(join(dir, entry));
    if (meta && (!input.onType || meta.onType === input.onType)) {
      out.push(meta);
    }
  }
  return out;
}

/* ------------------------------- load -------------------------------- */

/** Memoizes resolved {@link Selection}s across {@link loadFragment} calls, keyed by `${envName}|${name}`. */
const selectionCache = new Map<string, Selection>(); // key: `${envName}|${name}`

/** Clears the in-memory resolved-fragment cache. Mainly for test isolation. */
export function clearFragmentCache(): void {
  selectionCache.clear();
}

/** Input for {@link loadFragment}. */
export interface LoadFragmentInput {
  readonly envName: string;
  readonly name: string;
  readonly schema: GraphQLSchema;
}

/**
 * Reads the raw SDL for a fragment file.
 *
 * @throws If `name` is unsafe or no fragment file exists for it.
 */
async function readFragmentSdl(envName: string, name: string): Promise<string> {
  // envName is validated by the public callers (loadFragment), but `name`
  // can come from arbitrary FragmentSpread refs inside a saved fragment, so
  // re-validate it here to keep the file path inside the env directory.
  assertValidName(name);
  const path = join(envDir(envName), `${name}.graphql`);
  if (!existsSync(path)) {
    throw new Error(`Fragment "${name}" not found at ${path}.`);
  }
  return readFile(path, "utf-8");
}

/** Loads and parses a fragment, resolving spreads recursively, with cycle detection. */
export async function loadFragment(input: LoadFragmentInput): Promise<Selection> {
  assertValidEnvName(input.envName);
  assertValidName(input.name);
  const visiting: string[] = [];

  async function resolve(name: string): Promise<Selection> {
    const cacheKey = `${input.envName}|${name}`;
    const cached = selectionCache.get(cacheKey);
    if (cached) return cached;
    if (visiting.includes(name)) {
      throw new Error(`Fragment cycle detected: ${[...visiting, name].join(" -> ")}`);
    }
    visiting.push(name);
    try {
      const sdl = await readFragmentSdl(input.envName, name);
      const doc = parse(sdl);
      const def = extractFragmentDef(doc);
      const onType = def.typeCondition.name.value;
      const t = input.schema.getType(onType);
      if (!(t instanceof GraphQLObjectType) && !(t instanceof GraphQLInterfaceType)) {
        throw new Error(`Fragment "${name}" is on "${onType}" which is not an object/interface.`);
      }

      const sel = await selectionSetToSelection(t, def.selectionSet, resolve);
      selectionCache.set(cacheKey, sel);
      return sel;
    } finally {
      visiting.pop();
    }
  }

  return resolve(input.name);
}

/**
 * Converts a parsed GraphQL selection set into the {@link Selection} tree
 * shape used elsewhere in vex, resolving `FragmentSpread`s via `resolveSpread`
 * (see {@link loadFragment}'s `resolve`) and merging their fields in using a
 * first-writer-wins rule — see the inline comment on the `FragmentSpread`
 * branch for why that's safe today.
 *
 * @throws If a selected field doesn't exist, has a non-selectable type but
 *   a sub-selection, or an inline fragment is encountered (unsupported in v1).
 */
async function selectionSetToSelection(
  parent: GraphQLObjectType | GraphQLInterfaceType,
  set: SelectionSetNode,
  resolveSpread: (name: string) => Promise<Selection>
): Promise<Selection> {
  const fields: Record<string, Selection> = {};

  for (const sel of set.selections) {
    if (sel.kind === "Field") {
      const fieldName = sel.name.value;
      if (fieldName === "__typename") {
        fields[fieldName] = { kind: "scalar" };
        continue;
      }
      const fieldDef = parent.getFields()[fieldName];
      if (!fieldDef) {
        throw new Error(
          `Field "${fieldName}" missing on "${parent.name}" — schema may have changed; run vex schema refetch.`
        );
      }
      if (sel.selectionSet) {
        const inner = unwrapToNamed(fieldDef.type);
        if (inner instanceof GraphQLObjectType || inner instanceof GraphQLInterfaceType) {
          fields[fieldName] = await selectionSetToSelection(inner, sel.selectionSet, resolveSpread);
        } else {
          throw new Error(
            `Field "${fieldName}" on "${parent.name}" has no selectable inner object/interface type.`
          );
        }
      } else {
        fields[fieldName] = { kind: "scalar" };
      }
    } else if (sel.kind === "FragmentSpread") {
      const refName = sel.name.value;
      const resolved = await resolveSpread(refName);
      if (resolved.kind !== "object") {
        throw new Error(`Fragment "${refName}" did not resolve to an object selection.`);
      }
      // First-writer-wins merge: a directly-selected field on the parent takes precedence
      // over the same field from a spread. Acceptable for v1 because both selections
      // produce structurally identical scalar leaves; revisit if nested object selections
      // ever conflict between parent and spread.
      for (const [k, v] of Object.entries(resolved.fields)) {
        if (!(k in fields)) fields[k] = v;
      }
    } else {
      throw new Error("Inline fragments inside saved fragment files are not supported in v1.");
    }
  }

  return { kind: "object", fields };
}

/* ------------------------------ delete ------------------------------- */

/** Input for {@link deleteFragment}. */
export interface DeleteFragmentInput {
  readonly envName: string;
  readonly name: string;
}

/** Deletes a saved fragment and evicts it from the resolved-selection cache. Returns `{ deleted: false }` if the file did not exist. */
export async function deleteFragment(
  input: DeleteFragmentInput
): Promise<{ deleted: true } | { deleted: false; reason: string }> {
  assertValidEnvName(input.envName);
  assertValidName(input.name);
  const path = join(envDir(input.envName), `${input.name}.graphql`);
  if (!existsSync(path)) return { deleted: false, reason: "not found" };
  await unlink(path);
  selectionCache.delete(`${input.envName}|${input.name}`);
  return { deleted: true };
}

/* ------------------------------ getSdl ------------------------------- */

/** Input for {@link getFragmentSdl}. */
export interface GetFragmentSdlInput {
  readonly envName: string;
  readonly name: string;
}

/**
 * Returns the raw SDL text of a saved fragment.
 *
 * @throws If `input.name` is unsafe or no fragment file exists for it.
 */
export async function getFragmentSdl(input: GetFragmentSdlInput): Promise<string> {
  assertValidEnvName(input.envName);
  assertValidName(input.name);
  const path = join(envDir(input.envName), `${input.name}.graphql`);
  if (!existsSync(path)) {
    throw new Error(`Fragment "${input.name}" not found at ${path}.`);
  }
  return readFile(path, "utf-8");
}

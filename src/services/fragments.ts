/**
 * @module services/fragments
 *
 * Per-environment GraphQL fragment storage. Files live at
 * `~/.vendure-vex/fragments/{envName}/{Name}.graphql` and contain a single
 * `fragment Name on Type { ... }` definition.
 */

import { readFile, writeFile, rename, mkdir, readdir } from "node:fs/promises";
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

export function setFragmentsRootForTests(root: string | null): void {
  rootOverride = root;
}

function envDir(envName: string): string {
  if (rootOverride) return join(rootOverride, envName);
  return getFragmentsDir(envName);
}

export interface FragmentMeta {
  readonly name: string;
  readonly onType: string;
  readonly fields: number;
  readonly path: string;
}

export interface SaveFragmentInput {
  readonly envName: string;
  readonly name: string;
  readonly sdl: string;
  readonly schema: GraphQLSchema;
  readonly overwrite?: boolean;
}

const NAME_RE = /^[A-Za-z][A-Za-z0-9]*$/;

function extractFragmentDef(doc: DocumentNode): FragmentDefinitionNode {
  const defs = doc.definitions.filter(
    (d): d is FragmentDefinitionNode => d.kind === "FragmentDefinition"
  );
  if (defs.length !== 1) {
    throw new Error(`SDL must contain exactly one fragment definition (found ${defs.length}).`);
  }
  return defs[0];
}

// Use instanceof — no `as unknown as` casts.
function unwrapToNamed(t: unknown): unknown {
  let cur: unknown = t;
  while (cur instanceof GraphQLNonNull || cur instanceof GraphQLList) {
    cur = cur.ofType;
  }
  return cur;
}

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
    // FragmentSpread handled by the loader in Task 11.
  }
}

export async function saveFragment(input: SaveFragmentInput): Promise<{
  name: string;
  onType: string;
  path: string;
}> {
  if (!NAME_RE.test(input.name)) {
    throw new Error(`Fragment name "${input.name}" must match ${NAME_RE.source}.`);
  }

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

export interface ListFragmentsInput {
  readonly envName: string;
  readonly onType?: string;
}

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

export async function listFragments(input: ListFragmentsInput): Promise<readonly FragmentMeta[]> {
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

const selectionCache = new Map<string, Selection>(); // key: `${envName}|${name}`

export function clearFragmentCache(): void {
  selectionCache.clear();
}

export interface LoadFragmentInput {
  readonly envName: string;
  readonly name: string;
  readonly schema: GraphQLSchema;
}

async function readFragmentSdl(envName: string, name: string): Promise<string> {
  const path = join(envDir(envName), `${name}.graphql`);
  if (!existsSync(path)) {
    throw new Error(`Fragment "${name}" not found at ${path}.`);
  }
  return readFile(path, "utf-8");
}

/** Loads and parses a fragment, resolving spreads recursively, with cycle detection. */
export async function loadFragment(input: LoadFragmentInput): Promise<Selection> {
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

      const sel = await selectionSetToSelection(t, def.selectionSet, input.schema, resolve);
      selectionCache.set(cacheKey, sel);
      return sel;
    } finally {
      visiting.pop();
    }
  }

  return resolve(input.name);
}

async function selectionSetToSelection(
  parent: GraphQLObjectType | GraphQLInterfaceType,
  set: SelectionSetNode,
  schema: GraphQLSchema,
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
          fields[fieldName] = await selectionSetToSelection(
            inner,
            sel.selectionSet,
            schema,
            resolveSpread
          );
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
      // Inline merge: spread's fields become part of parent's fields. Existing keys win.
      for (const [k, v] of Object.entries(resolved.fields)) {
        if (!(k in fields)) fields[k] = v;
      }
    } else {
      throw new Error("Inline fragments inside saved fragment files are not supported in v1.");
    }
  }

  return { kind: "object", fields };
}

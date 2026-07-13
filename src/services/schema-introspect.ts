/**
 * @module services/schema-introspect
 *
 * Schema slicing helpers used by the MCP introspection tools.
 * Stateless; takes a parsed `GraphQLSchema` and returns SDL slices or
 * trimmed metadata.
 */

import {
  printType,
  getNamedType,
  GraphQLObjectType,
  GraphQLInterfaceType,
  GraphQLInputObjectType,
  GraphQLUnionType,
  GraphQLNonNull,
  GraphQLList,
  type GraphQLSchema,
  type GraphQLNamedType,
  type GraphQLType,
} from "graphql";
import { customFieldsType } from "../schema-model/classify.js";

const BUILTIN = new Set(["String", "Int", "Float", "Boolean", "ID"]);

/** Canonical SDL string for any GraphQL type (e.g. `[Customer!]!`). No cast needed. */
const gqlTypeStr = (t: GraphQLType): string => String(t);

/**
 * Returns the names of all types directly referenced by `t`'s fields (field
 * types, argument types, and implemented interfaces for object/interface
 * types; member types for unions). Used to seed the next depth level of
 * {@link describeType}'s traversal.
 */
function referencedTypeNames(t: GraphQLNamedType): string[] {
  const names = new Set<string>();
  if (t instanceof GraphQLObjectType || t instanceof GraphQLInterfaceType) {
    for (const f of Object.values(t.getFields())) {
      names.add(getNamedType(f.type).name);
      for (const a of f.args) names.add(getNamedType(a.type).name);
    }
    for (const i of t.getInterfaces()) names.add(i.name);
  } else if (t instanceof GraphQLInputObjectType) {
    for (const f of Object.values(t.getFields())) {
      names.add(getNamedType(f.type).name);
    }
  } else if (t instanceof GraphQLUnionType) {
    for (const m of t.getTypes()) names.add(m.name);
  }
  return [...names];
}

/**
 * Prints the SDL for a named type, optionally including the SDL of types it
 * directly references (one extra level when `depth` is 2). Each type is
 * printed at most once even if reachable via multiple paths.
 *
 * @param name - The type name to look up in `schema`.
 * @param depth - How many levels of referenced types to include; `1` prints
 *   only `name` itself, `2` also prints its immediate references.
 * @throws {Error} If `name` does not exist in `schema`.
 */
export function describeType(schema: GraphQLSchema, name: string, depth: 1 | 2 = 1): string {
  const root = schema.getType(name);
  if (!root) throw new Error(`Type "${name}" not found in schema.`);
  const visited = new Set<string>();
  const out: string[] = [];

  function visit(t: GraphQLNamedType, currentDepth: number): void {
    if (visited.has(t.name) || BUILTIN.has(t.name)) return;
    visited.add(t.name);
    out.push(printType(t));
    if (currentDepth < depth) {
      for (const refName of referencedTypeNames(t)) {
        const ref = schema.getType(refName);
        if (ref) visit(ref, currentDepth + 1);
      }
    }
  }
  visit(root, 0);
  return out.join("\n\n");
}

/** A single typed `customFields` entry on a Vendure object type. */
export interface CustomFieldInfo {
  readonly name: string;
  readonly type: string;
  readonly nullable: boolean;
  readonly list: boolean;
  readonly description: string | null;
}

/**
 * Lists the typed `customFields` entries for a Vendure object type, if any.
 * Returns `customFields: null` with an explanatory `message` when `typeName`
 * is not an object type or has no `customFields` type in the schema.
 */
export function listCustomFields(
  schema: GraphQLSchema,
  typeName: string
): { customFields: readonly CustomFieldInfo[] | null; message?: string } {
  const t = schema.getType(typeName);
  if (!(t instanceof GraphQLObjectType)) {
    return { customFields: null, message: `Type "${typeName}" is not an object type.` };
  }
  const cf = customFieldsType(t);
  if (!cf) {
    return { customFields: null, message: `Type "${typeName}" has no typed customFields.` };
  }
  // Bug 4 fix: use instanceof directly for narrowing, no casts.
  const fields: CustomFieldInfo[] = Object.values(cf.getFields()).map((f) => {
    const nonNull = f.type instanceof GraphQLNonNull;
    const inner = f.type instanceof GraphQLNonNull ? f.type.ofType : f.type;
    const isList = inner instanceof GraphQLList;
    const named = getNamedType(f.type);
    return {
      name: f.name,
      type: named.name,
      nullable: !nonNull,
      list: isList,
      description: f.description ?? null,
    };
  });
  return { customFields: fields };
}

/** A summary of a single root query/mutation field: its name, kind, return type, and args. */
export interface OperationSummary {
  readonly name: string;
  readonly kind: "query" | "mutation";
  readonly returnType: string;
  readonly args: readonly { name: string; type: string }[];
}

/**
 * Lists root query and/or mutation fields, optionally filtered by kind and
 * by a case-insensitive substring match on the field name.
 */
export function listOperations(
  schema: GraphQLSchema,
  opts?: { kind?: "query" | "mutation"; search?: string }
): readonly OperationSummary[] {
  const out: OperationSummary[] = [];
  const wantQ = !opts?.kind || opts.kind === "query";
  const wantM = !opts?.kind || opts.kind === "mutation";
  const needle = opts?.search?.toLowerCase();

  function pushFrom(root: GraphQLObjectType | null | undefined, kind: "query" | "mutation") {
    if (!root) return;
    for (const [name, field] of Object.entries(root.getFields())) {
      if (needle && !name.toLowerCase().includes(needle)) continue;
      out.push({
        name,
        kind,
        returnType: gqlTypeStr(field.type),
        args: field.args.map((a) => ({ name: a.name, type: gqlTypeStr(a.type) })),
      });
    }
  }
  if (wantQ) pushFrom(schema.getQueryType(), "query");
  if (wantM) pushFrom(schema.getMutationType(), "mutation");
  return out;
}

/**
 * Prints the signature of a single query or mutation field plus the SDL of
 * every type it references (return type and argument types), so a caller
 * can see everything needed to call the operation in one slice.
 *
 * @throws {Error} If `name` is not a query or mutation field on `schema`.
 */
export function describeOperation(schema: GraphQLSchema, name: string): string {
  const q = schema.getQueryType()?.getFields()[name];
  const m = schema.getMutationType()?.getFields()[name];
  const field = q ?? m;
  if (!field) throw new Error(`Operation "${name}" not found.`);
  const kind = q ? "query" : "mutation";

  const argSig = field.args.length
    ? `(${field.args.map((a) => `${a.name}: ${gqlTypeStr(a.type)}`).join(", ")})`
    : "";
  const sigLine = `# ${kind}\n${name}${argSig}: ${gqlTypeStr(field.type)}`;

  const refs = new Set<string>();
  refs.add(getNamedType(field.type).name);
  for (const a of field.args) refs.add(getNamedType(a.type).name);

  const sliced: string[] = [];
  for (const refName of refs) {
    if (BUILTIN.has(refName)) continue;
    const t = schema.getType(refName);
    if (t) sliced.push(printType(t));
  }
  return `${sigLine}\n\n${sliced.join("\n\n")}`;
}

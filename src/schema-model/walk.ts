/**
 * @module schema-model/walk
 *
 * Computes leaf-field paths reachable from a root object type, up to a
 * configurable maximum depth. A "leaf" is a scalar or enum field; object
 * fields are descended into.
 */

import {
  GraphQLObjectType,
  GraphQLNonNull,
  GraphQLList,
  GraphQLScalarType,
  GraphQLEnumType,
  type GraphQLOutputType,
} from "graphql";

/** A leaf field reachable from the root type, with its dotted path and scalar type name. */
export interface LeafPath {
  readonly path: string;
  readonly typeName: string;
}

export interface WalkOptions {
  readonly maxDepth: number;
}

function unwrap(t: GraphQLOutputType): GraphQLOutputType {
  while (t instanceof GraphQLNonNull || t instanceof GraphQLList) {
    t = t.ofType as GraphQLOutputType;
  }
  return t;
}

function walk(
  type: GraphQLObjectType,
  prefix: string,
  depth: number,
  maxDepth: number,
  visited: ReadonlySet<string>,
  out: LeafPath[]
): void {
  if (depth > maxDepth) return;

  // Mark the current type as visited so descendants cannot recurse back into it.
  const next = new Set(visited);
  next.add(type.name);

  for (const [fieldName, field] of Object.entries(type.getFields())) {
    const inner = unwrap(field.type);
    const path = prefix ? `${prefix}.${fieldName}` : fieldName;
    if (inner instanceof GraphQLScalarType || inner instanceof GraphQLEnumType) {
      out.push({ path, typeName: inner.name });
    } else if (inner instanceof GraphQLObjectType) {
      // Only descend if the child type has not yet been seen on this path (cycle guard).
      if (!visited.has(inner.name)) {
        walk(inner, path, depth + 1, maxDepth, next, out);
      }
    }
    // Interfaces/unions: skipped in the flat selector (handled via dedicated wizard escape hatches).
  }
}

/** Returns every reachable leaf-field path from `root`, capped at `maxDepth`. Cycles are detected and stopped. */
export function reachableLeafPaths(
  root: GraphQLObjectType,
  opts: WalkOptions
): readonly LeafPath[] {
  const out: LeafPath[] = [];
  walk(root, "", 1, opts.maxDepth, new Set(), out);
  return out;
}

/**
 * @module schema-model/walk
 *
 * Computes leaf-field paths reachable from a root object type, up to a
 * configurable maximum depth. A "leaf" is a scalar or enum field; object
 * fields are descended into.
 *
 * Fields typed as `GraphQLInterfaceType` or `GraphQLUnionType` are not
 * traversed and do not appear in the output. Callers that need to handle
 * abstract types (e.g. inline-fragment selection) must use a separate
 * mechanism — the wizard's "Paste GraphQL selection" preset is the
 * intended escape hatch.
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

/** Options for {@link reachableLeafPaths}. */
export interface WalkOptions {
  readonly maxDepth: number;
}

/** Strips any number of `NonNull`/`List` wrappers, returning the underlying named type. */
function unwrap(t: GraphQLOutputType): GraphQLOutputType {
  while (t instanceof GraphQLNonNull || t instanceof GraphQLList) {
    t = t.ofType as GraphQLOutputType;
  }
  return t;
}

/**
 * Depth-first walk over `type`'s fields, appending every leaf (scalar/enum)
 * field's dotted path to `out`. Recursion stops once `depth` exceeds
 * `maxDepth`. `visited` holds the object-type names already on the current
 * path; before descending into a child object type it is checked against
 * `visited` and, if new, added to a copy (`next`) passed down the recursion
 * — this prevents infinite recursion on cyclic schemas (e.g. `Product` →
 * `variants` → `product`) without needing a global depth-independent guard.
 * Interface/union-typed fields are skipped entirely (see module docs).
 *
 * @param prefix - Dotted path accumulated so far (empty at the root call).
 * @param depth - Current depth, 1-based at the root call.
 * @param out - Mutated in place to collect results.
 */
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

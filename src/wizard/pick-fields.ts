/**
 * @module wizard/pick-fields
 *
 * Step 3 of the wizard (Customize path). Flat multi-select over every
 * reachable leaf path up to the configured max depth.
 */

import { multiselect, isCancel, cancel } from "@clack/prompts";
import type { GraphQLObjectType } from "graphql";
import { reachableLeafPaths } from "../schema-model/walk.js";
import type { Selection } from "../schema-model/types.js";

/** Inputs to {@link pickFields}. */
export interface PickFieldsInput {
  /** The GraphQL object type to select fields from. */
  readonly type: GraphQLObjectType;
  /** Maximum path depth offered by {@link reachableLeafPaths}. */
  readonly maxDepth: number;
}

/**
 * Converts a flat list of dotted leaf paths (e.g. `"address.city"`) into a
 * nested {@link Selection} tree, merging paths that share a common prefix.
 */
function pathsToSelection(paths: readonly string[]): Selection {
  const root: Record<string, Selection> = {};
  for (const p of paths) {
    const parts = p.split(".");
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
      const key = parts[i];
      if (i === parts.length - 1) {
        cur[key] = { kind: "scalar" };
      } else {
        const existing = cur[key];
        const fields =
          existing && existing.kind === "object"
            ? (existing.fields as Record<string, Selection>)
            : {};
        cur[key] = { kind: "object", fields };
        cur = fields;
      }
    }
  }
  return { kind: "object", fields: root };
}

/**
 * Prompts the user to multi-select fields (up to `input.maxDepth`) from the
 * flattened set of reachable leaf paths under `input.type`.
 *
 * @returns The chosen paths converted into a {@link Selection} tree.
 * @throws If `input.type` has no selectable leaf paths at all.
 */
export async function pickFields(input: PickFieldsInput): Promise<Selection> {
  const all = reachableLeafPaths(input.type, { maxDepth: input.maxDepth });
  if (all.length === 0) {
    throw new Error(`No selectable fields under "${input.type.name}".`);
  }
  const picked = await multiselect({
    message: `Pick fields (depth ≤ ${input.maxDepth}):`,
    required: true,
    options: all.map((p) => ({ value: p.path, label: `${p.path} (${p.typeName})` })),
  });
  if (isCancel(picked)) {
    cancel("Cancelled. No request sent.");
    process.exit(130);
  }
  return pathsToSelection(picked);
}

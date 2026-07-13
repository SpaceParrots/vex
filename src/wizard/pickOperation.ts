/**
 * @module wizard/pickOperation
 *
 * Step 0 of the wizard. Resolves an operation by name; if missing, runs a
 * text-filter prompt followed by a clack `select` over the filtered ops.
 */

import { text, select, isCancel, cancel } from "@clack/prompts";
import type { GraphQLSchema, GraphQLField } from "graphql";

/** Inputs to {@link pickOperation}. */
export interface PickOperationInput {
  readonly schema: GraphQLSchema;
  /** Which root type to pick a field from. */
  readonly kind: "query" | "mutation";
  /** If set, resolved directly without prompting (errors if not found). */
  readonly nameHint?: string;
}

/** The resolved operation: its field name and schema field definition. */
export interface PickOperationResult {
  readonly name: string;
  readonly field: GraphQLField<unknown, unknown>;
}

/** Returns the schema's Query or Mutation root type for `kind`. */
function rootFor(schema: GraphQLSchema, kind: "query" | "mutation") {
  return kind === "query" ? schema.getQueryType() : schema.getMutationType();
}

/** Reports the clack cancel prompt and exits the process (128 + SIGINT) — this wizard step's cancel path. */
function bail(): never {
  cancel("Cancelled. No request sent.");
  process.exit(130);
}

/** Computes the classic edit-distance metric between two strings. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

/** Returns the 5 candidates closest to `name` by {@link levenshtein} distance, for "did you mean" errors. */
function suggest(name: string, candidates: readonly string[]): string[] {
  return [...candidates].sort((x, y) => levenshtein(name, x) - levenshtein(name, y)).slice(0, 5);
}

/**
 * Resolves a query/mutation field. If `input.nameHint` is given, it is looked
 * up directly (throwing with closest-name suggestions if not found).
 * Otherwise prompts for a text filter followed by a `select` over the
 * filtered operation names. Cancelling {@link bail}s (exits the process).
 *
 * @throws If the schema has no root type for `input.kind`, `nameHint` does
 *   not match any operation, or the text filter matches none.
 */
export async function pickOperation(input: PickOperationInput): Promise<PickOperationResult> {
  const root = rootFor(input.schema, input.kind);
  if (!root) throw new Error(`Schema has no ${input.kind} root type.`);
  const fields = root.getFields();
  const allNames = Object.keys(fields);

  if (input.nameHint) {
    const found = fields[input.nameHint];
    if (found) return { name: input.nameHint, field: found };
    const close = suggest(input.nameHint, allNames).join(", ");
    throw new Error(`No ${input.kind} named "${input.nameHint}". Did you mean: ${close}?`);
  }

  const filterRaw = await text({
    message: `Filter ${input.kind} operations (empty for all):`,
    placeholder: "e.g. cust",
  });
  if (isCancel(filterRaw)) bail();
  const filter = String(filterRaw ?? "").toLowerCase();

  const filtered = allNames
    .filter((n) => !filter || n.toLowerCase().includes(filter))
    .map((n) => ({ value: n, label: n }));

  if (filtered.length === 0) {
    throw new Error(`No ${input.kind} operations match "${filter}".`);
  }

  const picked = await select({
    message: `Select a ${input.kind}:`,
    options: filtered,
    maxItems: 12,
  });
  if (isCancel(picked)) bail();
  const name = String(picked);
  return { name, field: fields[name] };
}

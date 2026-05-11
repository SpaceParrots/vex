/**
 * @module wizard/pickOperation
 *
 * Step 0 of the wizard. Resolves an operation by name; if missing, runs a
 * text-filter prompt followed by a clack `select` over the filtered ops.
 */

import { text, select, isCancel, cancel } from "@clack/prompts";
import type { GraphQLSchema, GraphQLField } from "graphql";

export interface PickOperationInput {
  readonly schema: GraphQLSchema;
  readonly kind: "query" | "mutation";
  readonly nameHint?: string;
}

export interface PickOperationResult {
  readonly name: string;
  readonly field: GraphQLField<unknown, unknown>;
}

function rootFor(schema: GraphQLSchema, kind: "query" | "mutation") {
  return kind === "query" ? schema.getQueryType() : schema.getMutationType();
}

function bail(): never {
  cancel("Cancelled. No request sent.");
  process.exit(130);
}

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

function suggest(name: string, candidates: readonly string[]): string[] {
  return [...candidates].sort((x, y) => levenshtein(name, x) - levenshtein(name, y)).slice(0, 5);
}

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

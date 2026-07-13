/**
 * @module wizard/run
 *
 * Orchestrates the full wizard: pick op → variables → preset → maybe customize →
 * maybe save → render & execute.
 */

import { intro, outro, text, confirm, isCancel, cancel, log } from "@clack/prompts";
import {
  GraphQLObjectType,
  GraphQLUnionType,
  parse,
  getNamedType,
  type GraphQLSchema,
  type GraphQLNamedType,
} from "graphql";
import { getCurrentEnv } from "../context.js";
import { loadSchema, refetchSchema } from "../schema.js";
import { parseSchemaFromSdl } from "../schema-model/parse.js";
import { reachableLeafPaths } from "../schema-model/walk.js";
import {
  isPaginatedList,
  paginatedItemType,
  errorBranches,
  successBranches,
} from "../schema-model/classify.js";
import { listFragments, getFragmentSdl } from "../services/fragments.js";
import { saveOperation, detectSensitiveKeys } from "../services/operations.js";
import { buildAndExecute, buildDocument } from "../services/builder.js";
import type { Selection } from "../schema-model/types.js";
import type { FragmentDefinition } from "../schema-model/render.js";
import { DEFAULT_SELECTOR_MAX_DEPTH, MAX_SELECTOR_DEPTH } from "../constants.js";
import { pickOperation } from "./pick-operation.js";
import { promptVariables } from "./prompt-variables.js";
import { pickPreset } from "./pick-preset.js";
import { pickFields } from "./pick-fields.js";
import { maybeSaveFragment } from "./save-fragment.js";

/** Inputs to {@link runWizard}. */
export interface RunWizardInput {
  /** Whether to build a query or mutation. */
  readonly kind: "query" | "mutation";
  /** If set, skips the operation picker and resolves this operation directly. */
  readonly operationName?: string;
  /** If set, skips the preset picker and reuses this saved fragment for the top-level selection. */
  readonly fragmentName?: string;
  /** Max leaf-path depth offered when customizing a selection; capped at {@link MAX_SELECTOR_DEPTH}. */
  readonly maxDepth?: number;
  /** When true, build the document/variables but skip execution. */
  readonly dryRun?: boolean;
  /** When true, print the rendered GraphQL document and variables before executing. */
  readonly verbose?: boolean;
  /** When set, persist the built document + variables as a reusable operation. */
  readonly saveAs?: string;
  /** Allow overwriting an existing saved operation with the same name. */
  readonly overwriteSaved?: boolean;
}

/** Reports the clack cancel prompt and exits the process (128 + SIGINT) — the wizard's cancel path. */
function bail(): never {
  cancel("Cancelled. No request sent.");
  process.exit(130);
}

/**
 * Guards the wizard's entry point against non-interactive (script/CI)
 * invocation, where clack prompts cannot be answered.
 *
 * @throws If stdout is not a TTY, with a hint to use the non-interactive
 *   `--fragment` + variable-flags path instead.
 */
function ensureTty(): void {
  if (!process.stdout.isTTY) {
    throw new Error(
      "Wizard requires a TTY. Pipe-friendly mode: use `--fragment <Name>` plus variable flags."
    );
  }
}

/**
 * Builds a full "all scalars down to `depth`" {@link Selection} tree for
 * `typeForWalk`, by flattening {@link reachableLeafPaths} and re-nesting the
 * dotted paths. Used for the `allScalars`/`allScalarsPlusOne` presets.
 */
function selectionFromPaths(typeForWalk: GraphQLObjectType, depth: number): Selection {
  const paths = reachableLeafPaths(typeForWalk, { maxDepth: depth }).map((p) => p.path);
  const root: Record<string, Selection> = {};
  function set(parts: readonly string[], obj: Record<string, Selection>): void {
    const [head, ...rest] = parts;
    if (rest.length === 0) {
      obj[head] = { kind: "scalar" };
      return;
    }
    const existing = obj[head];
    const child: Selection =
      existing && existing.kind === "object"
        ? existing
        : { kind: "object", fields: {} };
    obj[head] = child;
    set(rest, (child as { fields: Record<string, Selection> }).fields);
  }
  for (const p of paths) set(p.split("."), root);
  return { kind: "object", fields: root };
}

/**
 * Resolves the current environment and its parsed schema, fetching and
 * caching it via {@link refetchSchema} on first use if no cache exists yet.
 */
async function ensureSchema(): Promise<{ envName: string; schema: GraphQLSchema }> {
  const { name, env } = await getCurrentEnv();
  let sdl: string;
  try {
    sdl = await loadSchema(env, name);
  } catch {
    log.warn("No cached schema. Fetching now…");
    sdl = await refetchSchema(env, name);
  }
  return { envName: name, schema: parseSchemaFromSdl(name, sdl) };
}

/**
 * Returns the item object type of `returnType` if it is a Vendure
 * `PaginatedList`-shaped type ({@link isPaginatedList}), or `null` otherwise
 * (either not paginated, or its item type isn't a selectable object).
 */
function paginatedReturn(returnType: GraphQLNamedType): GraphQLObjectType | null {
  if (!isPaginatedList(returnType)) return null;
  const item = paginatedItemType(returnType);
  return item instanceof GraphQLObjectType ? item : null;
}

/**
 * Resolves the selection set for a single object type, either by reusing a
 * fragment (explicit `fragmentNameOverride`, or one chosen via
 * {@link pickPreset}), an all-scalars preset, the {@link pickFields} flat
 * customize flow (offering to save the result as a fragment via
 * {@link maybeSaveFragment}), or a pasted raw selection set parsed as a
 * synthetic fragment. Cancelling the paste prompt {@link bail}s (exits the
 * process).
 *
 * @returns The resolved {@link Selection} plus any fragment definitions that
 *   must be included in the rendered document.
 */
async function selectionForType(
  schemaCtx: { envName: string; schema: GraphQLSchema },
  type: GraphQLObjectType,
  fragmentNameOverride: string | undefined,
  maxDepth: number
): Promise<{
  selection: Selection;
  fragmentDefinitions: FragmentDefinition[];
}> {
  const fragmentDefinitions: FragmentDefinition[] = [];

  if (fragmentNameOverride) {
    const fragSdl = await getFragmentSdl({
      envName: schemaCtx.envName,
      name: fragmentNameOverride,
    });
    fragmentDefinitions.push({ name: fragmentNameOverride, sdl: fragSdl });
    return {
      selection: {
        kind: "object",
        fields: { __ref: { kind: "fragmentRef", name: fragmentNameOverride } },
      },
      fragmentDefinitions,
    };
  }

  const fragments = await listFragments({ envName: schemaCtx.envName, onType: type.name });
  const choice = await pickPreset({ typeName: type.name, fragments });

  if (choice.kind === "fragment") {
    const fragSdl = await getFragmentSdl({ envName: schemaCtx.envName, name: choice.name });
    fragmentDefinitions.push({ name: choice.name, sdl: fragSdl });
    return {
      selection: {
        kind: "object",
        fields: { __ref: { kind: "fragmentRef", name: choice.name } },
      },
      fragmentDefinitions,
    };
  }
  if (choice.kind === "allScalars") {
    return { selection: selectionFromPaths(type, 1), fragmentDefinitions };
  }
  if (choice.kind === "allScalarsPlusOne") {
    return { selection: selectionFromPaths(type, 2), fragmentDefinitions };
  }
  if (choice.kind === "customize") {
    const sel = await pickFields({ type, maxDepth });
    await maybeSaveFragment({
      envName: schemaCtx.envName,
      typeName: type.name,
      selection: sel,
      schema: schemaCtx.schema,
    });
    return { selection: sel, fragmentDefinitions };
  }

  // paste
  const raw = await text({
    message: "Paste a GraphQL selection set, e.g. `{ id firstName }`:",
    placeholder: "{ id firstName }",
  });
  if (isCancel(raw)) bail();
  const synthName = `__Paste_${Date.now()}`;
  const fragSdl = `fragment ${synthName} on ${type.name} ${String(raw ?? "")}`;
  parse(fragSdl);
  fragmentDefinitions.push({ name: synthName, sdl: fragSdl });
  return {
    selection: {
      kind: "object",
      fields: { __ref: { kind: "fragmentRef", name: synthName } },
    },
    fragmentDefinitions,
  };
}

/**
 * Runs the full interactive query/mutation builder wizard: picks an
 * operation ({@link pickOperation}), prompts for its arguments
 * ({@link promptVariables}), resolves the selection set for its return type
 * (handling union, paginated-list, and plain object shapes via
 * {@link selectionForType}), optionally previews or saves the built
 * document, and finally executes it (unless `input.dryRun`) and prints the
 * response.
 *
 * @throws If not run in a TTY ({@link ensureTty}), or if the operation's
 *   return type is not a selectable shape.
 */
export async function runWizard(input: RunWizardInput): Promise<void> {
  ensureTty();
  const ctx = await ensureSchema();

  intro(`vex builder — ${input.kind}`);

  const op = await pickOperation({
    schema: ctx.schema,
    kind: input.kind,
    nameHint: input.operationName,
  });

  const variables = await promptVariables(op.field.args, ctx.schema);

  const returnNamed = getNamedType(op.field.type);

  let selection: Selection;
  const fragmentDefinitions: FragmentDefinition[] = [];

  const maxDepth = Math.min(
    input.maxDepth ?? DEFAULT_SELECTOR_MAX_DEPTH,
    MAX_SELECTOR_DEPTH
  );

  if (returnNamed instanceof GraphQLUnionType) {
    const errBr = errorBranches(returnNamed);
    const okBr = successBranches(returnNamed);
    const branches: Record<string, Selection> = {};
    for (const ok of okBr) {
      const hasSelectableFields = reachableLeafPaths(ok, { maxDepth: 1 }).length > 0;
      if (!hasSelectableFields) {
        branches[ok.name] = { kind: "object", fields: { __typename: { kind: "scalar" } } };
        continue;
      }
      const sub = await selectionForType(ctx, ok, input.fragmentName, maxDepth);
      branches[ok.name] = sub.selection;
      fragmentDefinitions.push(...sub.fragmentDefinitions);
    }
    for (const e of errBr) {
      branches[e.name] = {
        kind: "object",
        fields: { errorCode: { kind: "scalar" }, message: { kind: "scalar" } },
      };
    }
    selection = { kind: "union", branches, includeTypename: true };
  } else {
    const paginated =
      returnNamed instanceof GraphQLObjectType ? paginatedReturn(returnNamed) : null;
    if (paginated) {
      const itemSel = await selectionForType(ctx, paginated, input.fragmentName, maxDepth);
      fragmentDefinitions.push(...itemSel.fragmentDefinitions);
      selection = {
        kind: "object",
        fields: {
          items: itemSel.selection,
          totalItems: { kind: "scalar" },
        },
      };
    } else if (returnNamed instanceof GraphQLObjectType) {
      const sub = await selectionForType(ctx, returnNamed, input.fragmentName, maxDepth);
      selection = sub.selection;
      fragmentDefinitions.push(...sub.fragmentDefinitions);
    } else {
      throw new Error(`Return type "${returnNamed.name}" is not selectable in v1.`);
    }
  }

  const built = buildDocument({
    schema: ctx.schema,
    kind: input.kind,
    operationName: op.name,
    variables,
    selection,
    fragments: fragmentDefinitions,
  });

  if (input.verbose) {
    log.message("--- GraphQL ---");
    console.log(built.query);
    log.message("--- Variables ---");
    console.log(JSON.stringify(built.variables, null, 2));
  }

  if (input.saveAs) {
    const sensitive = detectSensitiveKeys(built.variables as Record<string, unknown>);
    let proceed = true;
    if (sensitive.length > 0) {
      log.warn(
        `Variables include keys that look sensitive: ${sensitive.join(", ")}. ` +
          `Saved operation files are stored unencrypted on disk.`
      );
      const ok = await confirm({
        message: "Save anyway?",
        initialValue: false,
      });
      if (isCancel(ok)) bail();
      proceed = Boolean(ok);
    }
    if (proceed) {
      const meta = await saveOperation({
        envName: ctx.envName,
        name: input.saveAs,
        kind: input.kind,
        rootField: op.name,
        document: built.query,
        variables: built.variables as Record<string, unknown>,
        overwrite: input.overwriteSaved,
      });
      log.success(`Saved operation "${meta.name}" → ${meta.path}`);
    } else {
      log.info("Skipped saving operation.");
    }
  }

  if (input.dryRun) {
    outro("Dry run — no request sent.");
    return;
  }

  const data = await buildAndExecute({
    schema: ctx.schema,
    kind: input.kind,
    operationName: op.name,
    variables,
    selection,
    fragments: fragmentDefinitions,
  });
  if (input.verbose) log.message("--- Response ---");
  console.log(JSON.stringify(data, null, 2));
  outro("Done.");
}

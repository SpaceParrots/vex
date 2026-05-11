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
import { getActiveEnv } from "../config.js";
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
import { pickOperation } from "./pickOperation.js";
import { promptVariables } from "./promptVariables.js";
import { pickPreset } from "./pickPreset.js";
import { pickFields } from "./pickFields.js";
import { maybeSaveFragment } from "./saveFragment.js";

export interface RunWizardInput {
  readonly kind: "query" | "mutation";
  readonly operationName?: string;
  readonly fragmentName?: string;
  readonly maxDepth?: number;
  readonly dryRun?: boolean;
  /** When true, print the rendered GraphQL document and variables before executing. */
  readonly verbose?: boolean;
  /** When set, persist the built document + variables as a reusable operation. */
  readonly saveAs?: string;
  /** Allow overwriting an existing saved operation with the same name. */
  readonly overwriteSaved?: boolean;
}

function bail(): never {
  cancel("Cancelled. No request sent.");
  process.exit(130);
}

function ensureTty(): void {
  if (!process.stdout.isTTY) {
    throw new Error(
      "Wizard requires a TTY. Pipe-friendly mode: use `--fragment <Name>` plus variable flags."
    );
  }
}

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

async function ensureSchema(): Promise<{ envName: string; schema: GraphQLSchema }> {
  const { name, env } = await getActiveEnv();
  let sdl: string;
  try {
    sdl = await loadSchema(env, name);
  } catch {
    log.warn("No cached schema. Fetching now…");
    sdl = await refetchSchema(env, name);
  }
  return { envName: name, schema: parseSchemaFromSdl(name, sdl) };
}

function paginatedReturn(returnType: GraphQLNamedType): GraphQLObjectType | null {
  if (!isPaginatedList(returnType)) return null;
  const item = paginatedItemType(returnType);
  return item instanceof GraphQLObjectType ? item : null;
}

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

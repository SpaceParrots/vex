/**
 * @module wizard/save-fragment
 *
 * Step 4 of the wizard (post-Customize). Optionally persists the built
 * Selection as a fragment file.
 */

import { confirm, text, isCancel, cancel } from "@clack/prompts";
import type { GraphQLSchema } from "graphql";
import { renderDocument } from "../schema-model/render.js";
import type { Selection } from "../schema-model/types.js";
import { saveFragment } from "../services/fragments.js";

const NAME_RE = /^[A-Za-z][A-Za-z0-9]*$/;

/** Inputs to {@link maybeSaveFragment}. */
export interface MaybeSaveFragmentInput {
  readonly envName: string;
  /** The GraphQL type the fragment will be declared `on`. */
  readonly typeName: string;
  /** The selection set to persist. */
  readonly selection: Selection;
  readonly schema: GraphQLSchema;
}

/**
 * Renders `selection` as a standalone fragment definition SDL string, by
 * rendering it as the body of a synthetic `_synth` query field and
 * extracting just the inner selection-set text out of that document.
 */
function buildFragmentSdl(name: string, onType: string, selection: Selection): string {
  // Render a synthetic operation, then extract just the inner selection-set body
  // to wrap as a fragment definition. The synthetic root field is `_synth`; its
  // body lies between `_synth {` and the matching `}` before the operation close.
  const doc = renderDocument({
    kind: "query",
    name: "_Synth",
    operationField: "_synth",
    operationArgs: [],
    variables: {},
    selection,
  });
  const match = doc.query.match(/_synth\s*\{([\s\S]*)\n\s*\}\s*\n\}/);
  const body = match ? match[1].trim() : "";
  return `fragment ${name} on ${onType} {\n  ${body.replace(/\n/g, "\n  ")}\n}\n`;
}

/** Reports the clack cancel prompt and exits the process (128 + SIGINT) — this wizard step's cancel path. */
function bail(): never {
  cancel("Cancelled. No request sent.");
  process.exit(130);
}

/**
 * Offers to save `input.selection` as a reusable fragment. If confirmed,
 * prompts for a CamelCase name (re-prompting until valid), builds the SDL
 * via {@link buildFragmentSdl}, and saves it. If a fragment with that name
 * already exists, offers to overwrite it. Cancelling any prompt
 * {@link bail}s (exits the process); declining to save or to overwrite
 * simply returns without error.
 */
export async function maybeSaveFragment(input: MaybeSaveFragmentInput): Promise<void> {
  const yes = await confirm({
    message: "Save this selection as a fragment?",
    initialValue: false,
  });
  if (isCancel(yes)) bail();
  if (!yes) return;

  let name = "";
  for (;;) {
    const raw = await text({
      message: "Fragment name (CamelCase):",
      placeholder: `${input.typeName}Custom`,
      defaultValue: `${input.typeName}Custom`,
    });
    if (isCancel(raw)) bail();
    name = String(raw ?? "");
    if (NAME_RE.test(name)) break;
    console.error(`Invalid name "${name}". Use CamelCase letters/digits, starting with a letter.`);
  }

  const sdl = buildFragmentSdl(name, input.typeName, input.selection);
  try {
    await saveFragment({
      envName: input.envName,
      name,
      sdl,
      schema: input.schema,
    });
    console.log(`Saved fragment ${name}.`);
  } catch (err) {
    if ((err as Error).message.match(/already exists/i)) {
      const ow = await confirm({ message: `Overwrite existing "${name}"?`, initialValue: false });
      if (isCancel(ow) || !ow) {
        console.log("Skipped saving.");
        return;
      }
      await saveFragment({
        envName: input.envName,
        name,
        sdl,
        schema: input.schema,
        overwrite: true,
      });
      console.log(`Overwrote fragment ${name}.`);
    } else {
      throw err;
    }
  }
}

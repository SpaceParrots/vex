/**
 * @module wizard/saveFragment
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

export interface MaybeSaveFragmentInput {
  readonly envName: string;
  readonly typeName: string;
  readonly selection: Selection;
  readonly schema: GraphQLSchema;
}

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

function bail(): never {
  cancel("Cancelled. No request sent.");
  process.exit(130);
}

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

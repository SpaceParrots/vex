/**
 * @module wizard/pickPreset
 *
 * Step 2 of the wizard: select-set preset menu.
 * Returns a tag the orchestrator uses to route to the next step.
 */

import { select, isCancel, cancel } from "@clack/prompts";
import type { FragmentMeta } from "../services/fragments.js";

export type PresetChoice =
  | { kind: "fragment"; name: string }
  | { kind: "allScalars" }
  | { kind: "allScalarsPlusOne" }
  | { kind: "customize" }
  | { kind: "paste" };

export interface PickPresetInput {
  readonly typeName: string;
  readonly fragments: readonly FragmentMeta[];
}

export async function pickPreset(input: PickPresetInput): Promise<PresetChoice> {
  const options: { value: string; label: string }[] = [];
  for (const f of input.fragments) {
    options.push({
      value: `frag:${f.name}`,
      label: `Fragment: ${f.name} (${f.fields} fields)`,
    });
  }
  options.push(
    { value: "allScalars", label: "All scalars (recommended)" },
    { value: "allScalarsPlusOne", label: "All scalars + 1 level deep" },
    { value: "customize", label: "Customize (flat path selector)" },
    { value: "paste", label: "Paste GraphQL selection set" }
  );

  const picked = await select({
    message: `Selection on ${input.typeName}:`,
    options,
    maxItems: 12,
  });
  if (isCancel(picked)) {
    cancel("Cancelled. No request sent.");
    process.exit(130);
  }
  const v = String(picked);
  if (v.startsWith("frag:")) return { kind: "fragment", name: v.slice("frag:".length) };
  switch (v) {
    case "allScalars":
      return { kind: "allScalars" };
    case "allScalarsPlusOne":
      return { kind: "allScalarsPlusOne" };
    case "customize":
      return { kind: "customize" };
    case "paste":
      return { kind: "paste" };
    default:
      throw new Error(`Unexpected preset value: ${v}`);
  }
}

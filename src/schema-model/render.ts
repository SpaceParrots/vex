/**
 * @module schema-model/render
 *
 * Renders a `Selection` tree into a complete GraphQL document string with
 * variable declarations and any referenced fragment definitions appended.
 */

import type { Selection } from "./types.js";

export interface OperationArg {
  readonly name: string;
  readonly type: string; // e.g. "ID!" or "CustomerListOptions"
}

export interface FragmentDefinition {
  readonly name: string;
  readonly sdl: string; // full "fragment X on T { ... }"
}

export interface RenderInput {
  readonly kind: "query" | "mutation";
  readonly name: string; // operation name in the document
  readonly operationField: string; // the root field being called
  readonly operationArgs: readonly OperationArg[]; // declared variables
  readonly variables: Readonly<Record<string, unknown>>;
  readonly selection: Selection;
  readonly fragments?: readonly FragmentDefinition[];
}

export interface RenderOutput {
  readonly query: string;
  readonly variables: Readonly<Record<string, unknown>>;
}

function renderInlineValue(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "string") {
    // GraphQL forbids unescaped U+2028 / U+2029 inside StringValue, but JSON.stringify (ES2019+)
    // may emit them raw. Escape explicitly to keep the rendered document valid.
    return JSON.stringify(v).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.map(renderInlineValue).join(", ")}]`;
  if (typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>).map(
      ([k, val]) => `${k}: ${renderInlineValue(val)}`
    );
    return `{${entries.join(", ")}}`;
  }
  return JSON.stringify(v);
}

// Operation-level args are emitted as variable references (`$name`) by `renderDocument`.
// Nested-field args inside a Selection are inlined as literals here because they originate
// from already-realized values supplied by the wizard, not from the operation's variables.
function renderArgs(args: Readonly<Record<string, unknown>>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return "";
  return `(${entries.map(([k, v]) => `${k}: ${renderInlineValue(v)}`).join(", ")})`;
}

function renderSelection(sel: Selection, indent: string): string {
  switch (sel.kind) {
    case "scalar":
      return ""; // scalars have no body — caller emits the field name
    case "fragmentRef":
      return ""; // emitted by the parent loop as `...Name`
    case "object": {
      const inner = Object.entries(sel.fields).map(([name, child]) => {
        if (child.kind === "fragmentRef") return `${indent}  ...${child.name}`;
        if (child.kind === "scalar") return `${indent}  ${name}`;
        if (child.kind === "object") {
          const args = child.args ? renderArgs(child.args) : "";
          return `${indent}  ${name}${args} {\n${renderSelection(child, indent + "  ")}\n${indent}  }`;
        }
        // union
        return `${indent}  ${name} {\n${renderSelection(child, indent + "  ")}\n${indent}  }`;
      });
      return inner.join("\n");
    }
    case "union": {
      const lines: string[] = [];
      if (sel.includeTypename) lines.push(`${indent}  __typename`);
      for (const [type, child] of Object.entries(sel.branches)) {
        if (child.kind === "object") {
          lines.push(`${indent}  ... on ${type} {\n${renderSelection(child, indent + "  ")}\n${indent}  }`);
        }
      }
      return lines.join("\n");
    }
  }
}

function collectReferencedFragments(sel: Selection, into: Set<string>): void {
  switch (sel.kind) {
    case "fragmentRef":
      into.add(sel.name);
      return;
    case "object":
      for (const child of Object.values(sel.fields)) collectReferencedFragments(child, into);
      return;
    case "union":
      for (const child of Object.values(sel.branches)) collectReferencedFragments(child, into);
      return;
    case "scalar":
      return;
  }
}

/** Renders a complete GraphQL document for the operation, ready for `client.request()`. */
export function renderDocument(input: RenderInput): RenderOutput {
  const argList = input.operationArgs.length
    ? `(${input.operationArgs.map((a) => `$${a.name}: ${a.type}`).join(", ")})`
    : "";
  const callArgs = input.operationArgs.length
    ? `(${input.operationArgs.map((a) => `${a.name}: $${a.name}`).join(", ")})`
    : "";

  const body = renderSelection(input.selection, "  ");
  const opKw = input.kind;
  let doc = `${opKw} ${input.name}${argList} {\n  ${input.operationField}${callArgs} {\n${body}\n  }\n}\n`;

  // Append referenced fragment definitions; refuse silently dropping a referenced fragment.
  const refs = new Set<string>();
  collectReferencedFragments(input.selection, refs);
  if (refs.size > 0) {
    const byName = new Map((input.fragments ?? []).map((f) => [f.name, f]));
    for (const name of refs) {
      const f = byName.get(name);
      if (!f) {
        throw new Error(
          `Selection references fragment "${name}" but no matching fragment definition was provided.`
        );
      }
      doc += `\n${f.sdl}\n`;
    }
  }

  return { query: doc, variables: input.variables };
}

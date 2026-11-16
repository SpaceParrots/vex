/**
 * @module cli-input
 *
 * Resolves CLI arguments that take either an inline value or a file. Long
 * values do not fit on the Windows command line (about 8,000 characters), so
 * the same argument also accepts a file path or `-` for stdin. Which one was
 * meant is decided by the value itself:
 *
 * - GraphQL document: contains `{` → inline, otherwise a file path.
 * - Variables JSON: starts with `{` or `[` → inline, otherwise a file path.
 * - `-` → read from stdin.
 *
 * Every GraphQL operation has a selection set and every JSON object starts
 * with `{`, so an inline value is never mistaken for a path. Files and stdin
 * are decoded as UTF-8 and a leading byte order mark is dropped, so files
 * saved by Windows editors parse cleanly.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { InputError } from "./errors.js";

/** Value that reads the argument from stdin. */
export const STDIN_MARKER = "-";

const BOM = "﻿";

/** Help text appended to `vex query` and `vex mutate`. */
export const INPUT_HELP = `
Inline or file:
  <graphql> and --variables each take an inline value, a file path, or - for stdin.
  vex decides by the value itself:
    <graphql>     contains "{"         -> inline GraphQL, otherwise a file path
    --variables   starts with "{"      -> inline JSON, otherwise a file path
    -             read from stdin (only one argument per call)
  Files are read as UTF-8 (a leading BOM is ignored). Relative paths resolve
  against the current directory.

  Use files for long input: the Windows command line stops at about 8,000
  characters, and files avoid shell quoting of JSON entirely.

Examples:
  $ vex query '{ activeChannel { id code } }'
  $ vex query orders.graphql --variables '{"options":{"take":5}}'
  $ vex mutate update-newsletter.graphql --variables vars.json
  $ cat vars.json | vex mutate update-newsletter.graphql --variables -
`;

/** Reads all of stdin as UTF-8. */
export async function readStdin(stream: NodeJS.ReadableStream = process.stdin): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : (chunk as Buffer));
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Dependencies of the resolvers, replaceable in tests. */
export interface InputSources {
  readonly readStdin: () => Promise<string>;
}

const defaultSources: InputSources = {
  readStdin: async () => {
    if (process.stdin.isTTY === true) {
      throw new InputError("Nothing was piped to stdin (-).", {
        hint: "Pipe the input in, e.g. `cat vars.json | vex mutate m.graphql --variables -`, or pass a file path.",
      });
    }
    return readStdin();
  },
};

/** Whether a document argument is inline GraphQL rather than a file path. */
export function isInlineDocument(value: string): boolean {
  return value.includes("{");
}

/** Whether a variables argument is inline JSON rather than a file path. */
export function isInlineJson(value: string): boolean {
  const first = value.trimStart()[0];
  return first === "{" || first === "[";
}

/** Reads a UTF-8 file, turning filesystem errors into an {@link InputError}. */
async function readTextFile(path: string, label: string, inlineRule: string): Promise<string> {
  const fullPath = resolve(path);
  try {
    return stripBom(await readFile(fullPath, "utf8"));
  } catch (err) {
    const reason = (err as NodeJS.ErrnoException).code === "ENOENT" ? "no such file" : (err as Error).message;
    throw new InputError(`Cannot read ${label} from file ${fullPath}: ${reason}`, {
      hint: `The value was read as a file path because ${inlineRule}. Check the path, or pass the value inline.`,
      cause: err,
    });
  }
}

/** Returns the document text from an inline value, a file path, or stdin. */
export async function readDocumentArg(value: string, sources: InputSources = defaultSources): Promise<string> {
  const text =
    value === STDIN_MARKER
      ? stripBom(await sources.readStdin())
      : isInlineDocument(value)
        ? value
        : await readTextFile(value, "the GraphQL document", 'it contains no "{"');
  if (text.trim().length === 0) {
    throw new InputError("The GraphQL document is empty.");
  }
  return text;
}

/** Returns the variables object from inline JSON, a file path, or stdin. */
export async function readVariablesArg(
  value: string,
  label: string,
  sources: InputSources = defaultSources
): Promise<Record<string, unknown>> {
  if (value === STDIN_MARKER) return parseVariablesJson(stripBom(await sources.readStdin()), label);
  if (isInlineJson(value)) {
    return parseVariablesJson(value, label, {
      hint: "If shell quoting is the problem, save the JSON to a file and pass its path instead.",
    });
  }
  return parseVariablesJson(await readTextFile(value, label, 'it does not start with "{"'), label);
}

/** Parses a variables JSON text, which must be an object. `hint` is shown on a syntax error. */
export function parseVariablesJson(
  text: string,
  label: string,
  options: { readonly hint?: string } = {}
): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new InputError(`Invalid JSON in ${label}: ${(err as Error).message}`, { hint: options.hint, cause: err });
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new InputError(`${label} must be a JSON object, e.g. {"id": "1"}.`);
  }
  return parsed as Record<string, unknown>;
}

/** Raw `vex query` / `vex mutate` input as typed on the command line. */
export interface RawOperationInput {
  readonly document: string;
  readonly variables?: string;
}

/** Resolved document and variables, ready to send. */
export interface ResolvedOperationInput {
  readonly document: string;
  readonly variables?: Record<string, unknown>;
}

/** Resolves the document argument and `--variables` into what is sent to the API. */
export async function resolveOperationInput(
  input: RawOperationInput,
  sources: InputSources = defaultSources
): Promise<ResolvedOperationInput> {
  if (input.document === STDIN_MARKER && input.variables === STDIN_MARKER) {
    throw new InputError("Only one argument can be read from stdin (-).", {
      hint: "Pass the other one inline or as a file path.",
    });
  }
  const document = await readDocumentArg(input.document, sources);
  return input.variables === undefined
    ? { document }
    : { document, variables: await readVariablesArg(input.variables, "--variables", sources) };
}

function stripBom(text: string): string {
  return text.startsWith(BOM) ? text.slice(BOM.length) : text;
}

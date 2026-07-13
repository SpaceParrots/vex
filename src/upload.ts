/**
 * @module upload
 *
 * File-upload transport for Vendure's `Upload` scalar, implementing the
 * GraphQL multipart request spec
 * (https://github.com/jaydenseric/graphql-multipart-request-spec) — the same
 * wire format `SimpleGraphQLClient.fileUploadMutation` from @vendure/testing
 * produces. Built on native fetch/FormData/Blob (Node 20+); `graphql-request`
 * v7 removed upload support, so this is hand-rolled with zero dependencies.
 */

import { readFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, extname } from "node:path";
import type { Environment } from "./config.js";
import { API_KEY_HEADER } from "./constants.js";
import { GraphQLRequestError, VexError, toVexError } from "./errors.js";
import { enrichPermissionError } from "./permission-errors.js";
import { isRecord } from "./guards.js";

/** Extension → MIME type map for upload file parts (fallback: octet-stream). */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  csv: "text/csv",
  json: "application/json",
  txt: "text/plain",
};

/** Returns the MIME type inferred from a file's extension. */
export function contentTypeFor(filePath: string): string {
  const ext = extname(filePath).slice(1).toLowerCase();
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

/**
 * Returns a copy of `target` with `value` set at the dotted `path`
 * (e.g. `"input.0.file"`). Numeric segments create/copy arrays, other
 * segments create/copy objects. Never mutates `target`.
 */
export function setValueAtPath(target: unknown, path: string, value: unknown): unknown {
  const segments = path.split(".");
  const setAt = (node: unknown, i: number): unknown => {
    if (i === segments.length) return value;
    const key = segments[i];
    if (/^\d+$/.test(key)) {
      const arr = Array.isArray(node) ? [...node] : [];
      arr[Number(key)] = setAt(arr[Number(key)], i + 1);
      return arr;
    }
    const obj =
      node && typeof node === "object" && !Array.isArray(node)
        ? { ...(node as Record<string, unknown>) }
        : {};
    obj[key] = setAt(obj[key], i + 1);
    return obj;
  };
  return setAt(target, 0);
}

/**
 * Builds the multipart/form-data body per the GraphQL multipart request spec:
 * an `operations` part (query + variables with `null` at each file position),
 * a `map` part, and one binary part per file (filename + inferred MIME type).
 *
 * @param document - The GraphQL mutation string.
 * @param variables - Mutation variables; file positions are nulled automatically.
 * @param files - Dotted variable path → local file path.
 */
export async function buildUploadForm(
  document: string,
  variables: Record<string, unknown>,
  files: Readonly<Record<string, string>>
): Promise<FormData> {
  const paths = Object.keys(files);
  let vars: unknown = variables;
  const map: Record<string, string[]> = {};
  paths.forEach((varPath, i) => {
    vars = setValueAtPath(vars, varPath, null);
    map[String(i)] = [`variables.${varPath}`];
  });

  const form = new FormData();
  form.append("operations", JSON.stringify({ query: document, variables: vars }));
  form.append("map", JSON.stringify(map));
  for (const [i, varPath] of paths.entries()) {
    const filePath = files[varPath];
    const blob = new Blob([await readFile(filePath)], { type: contentTypeFor(filePath) });
    form.append(String(i), blob, basename(filePath));
  }
  return form;
}

/** Narrows a parsed response body to one carrying a non-empty GraphQL `errors` array. */
function hasGraphQLErrors(
  body: Record<string, unknown>
): body is Record<string, unknown> & { errors: ReadonlyArray<Record<string, unknown>> } {
  return Array.isArray(body.errors) && body.errors.length > 0;
}

/**
 * Executes a GraphQL mutation with `Upload`-scalar variables against a
 * Vendure environment. Validates each file up front, sends the multipart
 * request with the `vendure-api-key` header (FormData sets the boundary),
 * and normalizes failures into typed {@link VexError}s.
 *
 * Every response is checked for both a usable GraphQL `errors` array and its
 * HTTP status: a non-2xx response WITH GraphQL errors is still enriched via
 * {@link enrichPermissionError} (unchanged from before), but a non-2xx
 * response with no usable `errors` array (e.g. a reverse proxy 413/502 with
 * an unrelated JSON body) now throws instead of silently returning
 * `undefined` as a "successful" result.
 *
 * @param env - Target environment (URL + API key).
 * @param document - The GraphQL mutation string.
 * @param variables - Mutation variables (file positions may be omitted or null).
 * @param files - Dotted variable path (e.g. `"input.0.file"`) → local file path.
 * @param envName - Optional env name for schema-aware error enrichment.
 * @throws {VexError} If a file is missing/unreadable.
 * @throws {GraphQLRequestError} If the server returns GraphQL errors, or a non-2xx status with no usable errors array.
 */
export async function requestWithUploads<T = unknown>(
  env: Environment,
  document: string,
  variables: Record<string, unknown>,
  files: Readonly<Record<string, string>>,
  envName?: string
): Promise<T> {
  for (const filePath of Object.values(files)) {
    try {
      await access(filePath, constants.R_OK);
    } catch {
      throw new VexError(`File not found or unreadable: ${filePath}`, {
        hint: "Check the path — it must be readable by vex on this machine.",
      });
    }
  }

  const form = await buildUploadForm(document, variables, files);
  let res: Response;
  try {
    res = await fetch(env.url, {
      method: "POST",
      headers: { [API_KEY_HEADER]: env.apiKey },
      body: form,
    });
  } catch (err) {
    throw toVexError(err);
  }

  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    throw new GraphQLRequestError(`HTTP ${res.status} — response was not JSON`, { status: res.status });
  }

  if (!isRecord(parsed)) {
    throw new GraphQLRequestError(`HTTP ${res.status} — unexpected response shape`, { status: res.status });
  }

  if (hasGraphQLErrors(parsed)) {
    const vexErr = toVexError({ response: { status: res.status, errors: parsed.errors } });
    throw envName ? await enrichPermissionError(vexErr, envName, document) : vexErr;
  }

  if (!res.ok) {
    throw new GraphQLRequestError(`HTTP ${res.status} — upload failed`, { status: res.status });
  }

  return parsed.data as T;
}

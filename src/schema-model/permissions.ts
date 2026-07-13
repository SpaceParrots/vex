/**
 * @module schema-model/permissions
 *
 * Pure helpers around Vendure's `Permission` enum: extract it from cached
 * SDL (including custom plugin permissions) and heuristically suggest which
 * permission an operation likely requires. Suggestions are advisory — the
 * schema does not expose per-operation permission metadata.
 */

import { parse, Kind } from "graphql";

/** One value of the Vendure `Permission` enum. */
export interface PermissionInfo {
  readonly name: string;
  readonly description?: string;
}

/**
 * Extracts the `Permission` enum values (with descriptions) from SDL.
 * Slices the enum block out first so huge schemas don't need a full parse;
 * returns an empty array when the enum is absent or unparsable.
 */
export function parsePermissions(sdl: string): readonly PermissionInfo[] {
  const start = sdl.search(/enum\s+Permission\s*{/);
  if (start === -1) return [];
  const end = sdl.indexOf("}", start);
  if (end === -1) return [];
  const snippet = sdl.slice(start, end + 1);
  try {
    const doc = parse(snippet);
    for (const def of doc.definitions) {
      if (def.kind === Kind.ENUM_TYPE_DEFINITION && def.name.value === "Permission") {
        return (def.values ?? []).map((v) => ({
          name: v.name.value,
          ...(v.description?.value ? { description: v.description.value } : {}),
        }));
      }
    }
  } catch {
    // Fall through — a description containing "}" can break the slice; treat as absent.
  }
  return [];
}

/** CRUD verb each operation-name prefix maps to. */
const VERB_MAP: Readonly<Record<string, string>> = {
  create: "Create",
  add: "Create",
  update: "Update",
  set: "Update",
  assign: "Update",
  transition: "Update",
  modify: "Update",
  move: "Update",
  delete: "Delete",
  remove: "Delete",
  get: "Read",
  list: "Read",
  find: "Read",
  search: "Read",
  query: "Read",
};

/**
 * Vendure groups some entities under an umbrella permission (e.g. products
 * live under the Catalog group). Adds the group name as a candidate.
 */
const GROUP_MAP: Readonly<Record<string, string>> = {
  product: "Catalog",
  variant: "Catalog",
  productvariant: "Catalog",
  collection: "Catalog",
  asset: "Catalog",
  facet: "Catalog",
  facetvalue: "Catalog",
};

/** Splits a camelCase operation name into its words. */
function splitWords(operationName: string): readonly string[] {
  return operationName
    .replace(/[^A-Za-z0-9]/g, " ")
    .split(/(?=[A-Z])|\s+/)
    .filter(Boolean);
}

/**
 * Suggests which `Permission` values an operation likely requires, by
 * verb+entity name matching (e.g. `createProduct` → CreateProduct,
 * CreateCatalog). Purely heuristic; capped at 4 suggestions.
 */
export function suggestPermissions(
  operationName: string,
  permissions: readonly PermissionInfo[]
): readonly string[] {
  const words = splitWords(operationName);
  if (words.length === 0) return [];
  const names = permissions.map((p) => p.name);
  const verb = words[0].toLowerCase();
  const crud = VERB_MAP[verb];
  // A bare entity name like `products` is a read query.
  const entityWords = crud ? words.slice(1) : words;
  const effectiveCrud = crud ?? (entityWords.length === words.length ? "Read" : undefined);
  const entity = entityWords.join("");
  const singular = entity.replace(/s$/i, "");
  const singularLower = singular.toLowerCase();

  const suggestions: string[] = [];
  const push = (name: string): void => {
    if (!suggestions.includes(name)) suggestions.push(name);
  };

  if (effectiveCrud && singular) {
    for (const candidate of [
      `${effectiveCrud}${singular}`,
      `${effectiveCrud}${entity}`,
      ...(GROUP_MAP[singularLower] ? [`${effectiveCrud}${GROUP_MAP[singularLower]}`] : []),
    ]) {
      if (names.includes(candidate)) push(candidate);
    }
    for (const name of names) {
      if (name.startsWith(effectiveCrud) && name.toLowerCase().includes(singularLower)) push(name);
    }
  }
  if (suggestions.length === 0) {
    // Unknown verb (e.g. transitionOrderToState) — match any word against permission names.
    for (const word of words.slice(1)) {
      const lower = word.toLowerCase().replace(/s$/i, "");
      if (lower.length < 3) continue;
      for (const name of names) {
        if (name.toLowerCase().includes(lower)) push(name);
      }
    }
  }
  return suggestions.slice(0, 4);
}

/**
 * Returns the first root field name of a GraphQL document (the operation the
 * user actually called), or undefined when the document cannot be parsed.
 */
export function extractOperationField(document: string): string | undefined {
  try {
    const doc = parse(document);
    for (const def of doc.definitions) {
      if (def.kind === Kind.OPERATION_DEFINITION) {
        const first = def.selectionSet.selections.find((s) => s.kind === Kind.FIELD);
        if (first && first.kind === Kind.FIELD) return first.name.value;
      }
    }
  } catch {
    // Raw document may be invalid — enrichment is best-effort.
  }
  return undefined;
}

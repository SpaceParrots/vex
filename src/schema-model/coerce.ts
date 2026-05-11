/**
 * @module schema-model/coerce
 *
 * Coerces raw string inputs (from CLI prompts) into JavaScript values that
 * match a `GraphQLInputType`. Scalars become real `boolean`/`number`/`string`,
 * input objects parse from JSON, and lists accept either JSON arrays or
 * comma-separated values. Used by the wizard's filter prompt so that boolean
 * and numeric variables are sent in the format the server expects.
 */

import {
  GraphQLNonNull,
  GraphQLList,
  GraphQLEnumType,
  GraphQLInputObjectType,
  GraphQLScalarType,
  type GraphQLInputType,
} from "graphql";

/** Trims a raw string. Returns `undefined` if empty, otherwise the trimmed value. */
function trimOrUndefined(raw: string): string | undefined {
  const t = raw.trim();
  return t === "" ? undefined : t;
}

/**
 * Coerces a raw scalar string to a JavaScript value matching the named GraphQL scalar.
 *
 * @throws If the scalar is `Boolean`/`Int`/`Float` and the raw value cannot be parsed.
 */
export function coerceScalar(raw: string, scalarName: string): unknown {
  switch (scalarName) {
    case "Boolean": {
      const lc = raw.trim().toLowerCase();
      if (lc === "true" || lc === "yes" || lc === "1") return true;
      if (lc === "false" || lc === "no" || lc === "0") return false;
      throw new Error(`Invalid Boolean: "${raw}". Use true/false.`);
    }
    case "Int": {
      const n = Number(raw);
      if (!Number.isInteger(n)) {
        throw new Error(`Invalid Int: "${raw}".`);
      }
      return n;
    }
    case "Float": {
      const n = Number(raw);
      if (Number.isNaN(n)) {
        throw new Error(`Invalid Float: "${raw}".`);
      }
      return n;
    }
    default:
      // ID, String, DateTime, JSON, and unknown custom scalars pass through as strings.
      return raw;
  }
}

/**
 * Coerces a raw string into a value matching a `GraphQLInputType`.
 *
 * - NonNull is unwrapped.
 * - Lists accept either a JSON array (`[1,2]`) or a comma-separated string (`a,b,c`);
 *   each element is then coerced recursively.
 * - Input objects parse as JSON.
 * - Enums and string-like scalars pass through; Boolean/Int/Float are parsed.
 *
 * @throws If the raw value cannot be coerced to the expected type.
 */
export function coerceInputValue(raw: string, type: GraphQLInputType): unknown {
  if (type instanceof GraphQLNonNull) {
    return coerceInputValue(raw, type.ofType as GraphQLInputType);
  }

  if (type instanceof GraphQLList) {
    const trimmed = trimOrUndefined(raw);
    if (trimmed === undefined) return [];
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (!Array.isArray(parsed)) {
          throw new Error("Expected a JSON array.");
        }
        return parsed;
      } catch (err) {
        throw new Error(`Invalid JSON array: ${(err as Error).message}`);
      }
    }
    if (trimmed.startsWith("{")) {
      throw new Error("Invalid JSON array: expected `[...]`, got an object.");
    }
    const itemType = type.ofType as GraphQLInputType;
    return trimmed.split(",").map((s) => coerceInputValue(s.trim(), itemType));
  }

  if (type instanceof GraphQLInputObjectType) {
    const trimmed = trimOrUndefined(raw);
    if (trimmed === undefined) return undefined;
    try {
      return JSON.parse(trimmed);
    } catch (err) {
      throw new Error(`Invalid JSON for ${type.name}: ${(err as Error).message}`);
    }
  }

  if (type instanceof GraphQLEnumType) {
    return raw;
  }

  if (type instanceof GraphQLScalarType) {
    return coerceScalar(raw, type.name);
  }

  return raw;
}

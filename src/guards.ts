/**
 * @module guards
 *
 * Shared runtime type guards for narrowing untrusted data (parsed JSON, HTTP
 * response bodies, GraphQL payloads) before its fields are read. A leaf
 * module: it imports nothing from the rest of vex, so any layer may use it.
 *
 * These exist so boundary code can narrow rather than cast — an `as` cast
 * asserts a shape the runtime never checked, which fails far from its origin.
 */

/**
 * Narrows an unknown value to a plain object whose fields can be indexed
 * safely. Rejects `null` and arrays, both of which are `typeof "object"` but
 * cannot be treated as records.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

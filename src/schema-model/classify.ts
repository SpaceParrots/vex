/**
 * @module schema-model/classify
 *
 * Structural detection of Vendure-shaped types in a parsed GraphQL schema.
 * No hardcoded type-name lists: all checks are based on shape (interfaces,
 * required field names/types).
 */

import {
  GraphQLObjectType,
  GraphQLInputObjectType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLScalarType,
  GraphQLUnionType,
  type GraphQLOutputType,
  type GraphQLNamedType,
  type GraphQLNamedOutputType,
} from "graphql";

/** True when the type implements a `PaginatedList` interface or has `items: [T!]!` + `totalItems: Int!`. */
export function isPaginatedList(type: GraphQLNamedType | null | undefined): boolean {
  if (!(type instanceof GraphQLObjectType)) return false;
  if (type.getInterfaces().some((i) => i.name === "PaginatedList")) return true;

  const fields = type.getFields();
  const items = fields.items?.type;
  const total = fields.totalItems?.type;
  if (!items || !total) return false;

  // items: [T!]!
  if (!(items instanceof GraphQLNonNull)) return false;
  const itemsInner = items.ofType;
  if (!(itemsInner instanceof GraphQLList)) return false;

  // totalItems: Int! (named "Int")
  if (!(total instanceof GraphQLNonNull)) return false;
  const totalInner = total.ofType;
  // totalItems: Int! (built-in Int scalar)
  if (!(totalInner instanceof GraphQLScalarType) || totalInner.name !== "Int") return false;

  return true;
}

/** Returns the element type of a paginated list's `items` field, or null if not paginated. */
export function paginatedItemType(type: GraphQLNamedType | null | undefined): GraphQLNamedOutputType | null {
  if (!isPaginatedList(type)) return null;
  const obj = type as GraphQLObjectType;
  const itemsType = obj.getFields().items.type;
  // unwrap: [T!]! -> T
  let cur: GraphQLOutputType = itemsType;
  while (cur instanceof GraphQLNonNull || cur instanceof GraphQLList) {
    cur = cur.ofType as GraphQLOutputType;
  }
  return cur as GraphQLNamedOutputType;
}

/** True when the input type's name ends in "ListOptions" and it has `take` and `skip` fields. */
export function isListOptionsInput(type: GraphQLNamedType | null | undefined): boolean {
  if (!(type instanceof GraphQLInputObjectType)) return false;
  if (!type.name.endsWith("ListOptions")) return false;
  const fields = type.getFields();
  return Boolean(fields.take && fields.skip);
}

/** True when the field type is a non-null `String!`. */
function isReqStringField(t: unknown): boolean {
  if (!(t instanceof GraphQLNonNull)) return false;
  const inner = t.ofType as { name?: string };
  return inner.name === "String";
}

/** True when the object type implements `ErrorResult` or has `errorCode: String!` + `message: String!`. */
function isErrorBranch(t: GraphQLObjectType): boolean {
  if (t.getInterfaces().some((i) => i.name === "ErrorResult")) return true;
  const f = t.getFields();
  return isReqStringField(f.errorCode?.type) && isReqStringField(f.message?.type);
}

/** Returns the union members that look like error results. */
export function errorBranches(union: GraphQLUnionType): readonly GraphQLObjectType[] {
  return union.getTypes().filter(isErrorBranch);
}

/** Returns the union members that are NOT error results. */
export function successBranches(union: GraphQLUnionType): readonly GraphQLObjectType[] {
  return union.getTypes().filter((t) => !isErrorBranch(t));
}

/** True when the type has `customFields` whose type is a non-null typed object (not JSON). */
export function hasTypedCustomFields(type: GraphQLObjectType | null | undefined): boolean {
  return customFieldsType(type) !== null;
}

/** Returns the `customFields` sub-object type, or null if customFields is absent or JSON-typed. */
export function customFieldsType(type: GraphQLObjectType | null | undefined): GraphQLObjectType | null {
  if (!type) return null;
  const f = type.getFields().customFields;
  if (!f) return null;
  let inner: unknown = f.type;
  while (inner instanceof GraphQLNonNull) {
    inner = inner.ofType;
  }
  if (inner instanceof GraphQLObjectType) return inner;
  return null;
}

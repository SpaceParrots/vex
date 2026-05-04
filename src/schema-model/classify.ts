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

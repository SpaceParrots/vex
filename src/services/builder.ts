/**
 * @module services/builder
 *
 * Bridges the schema-model layer to the network: takes a parsed schema +
 * operation name + Selection + variables, renders a GraphQL document, and
 * sends it via `getClient().request()`.
 */

import type { GraphQLSchema, GraphQLField } from "graphql";
import { GraphQLNonNull, GraphQLList } from "graphql";
import { getClient } from "../client.js";
import type { Selection } from "../schema-model/types.js";
import {
  renderDocument,
  type FragmentDefinition,
  type OperationArg,
} from "../schema-model/render.js";

export interface BuildAndExecuteInput {
  readonly schema: GraphQLSchema;
  readonly kind: "query" | "mutation";
  readonly operationName: string; // root field name on Query/Mutation
  readonly variables: Readonly<Record<string, unknown>>;
  readonly selection: Selection;
  readonly fragments?: readonly FragmentDefinition[];
}

function gqlTypeString(t: unknown): string {
  if (t instanceof GraphQLNonNull) return `${gqlTypeString(t.ofType)}!`;
  if (t instanceof GraphQLList) return `[${gqlTypeString(t.ofType)}]`;
  if (t && typeof t === "object" && "name" in t) return (t as { name: string }).name;
  return String(t);
}

function lookupOperation(
  schema: GraphQLSchema,
  kind: "query" | "mutation",
  name: string
): GraphQLField<unknown, unknown> {
  const root = kind === "query" ? schema.getQueryType() : schema.getMutationType();
  if (!root) throw new Error(`Schema has no ${kind} root type.`);
  const field = root.getFields()[name];
  if (!field) throw new Error(`No ${kind} operation named "${name}" on the schema.`);
  return field;
}

/** Builds the GraphQL document, executes it via `getClient()`, and returns the raw response. */
export async function buildAndExecute(input: BuildAndExecuteInput): Promise<unknown> {
  const field = lookupOperation(input.schema, input.kind, input.operationName);
  const operationArgs: OperationArg[] = field.args.map((a) => ({
    name: a.name,
    type: gqlTypeString(a.type),
  }));

  const docName =
    input.operationName.charAt(0).toUpperCase() + input.operationName.slice(1);

  const { query, variables } = renderDocument({
    kind: input.kind,
    name: docName,
    operationField: input.operationName,
    operationArgs,
    variables: input.variables,
    selection: input.selection,
    fragments: input.fragments,
  });

  const client = await getClient();
  return client.request(query, variables);
}

/** Render-only variant for `--dry-run`. Does not call the network. */
export function buildDocument(
  input: BuildAndExecuteInput
): { query: string; variables: Readonly<Record<string, unknown>> } {
  const field = lookupOperation(input.schema, input.kind, input.operationName);
  const operationArgs: OperationArg[] = field.args.map((a) => ({
    name: a.name,
    type: gqlTypeString(a.type),
  }));
  const docName =
    input.operationName.charAt(0).toUpperCase() + input.operationName.slice(1);
  return renderDocument({
    kind: input.kind,
    name: docName,
    operationField: input.operationName,
    operationArgs,
    variables: input.variables,
    selection: input.selection,
    fragments: input.fragments,
  });
}

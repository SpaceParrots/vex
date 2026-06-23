/**
 * @module services/schema
 *
 * Service layer for schema operations. Wraps {@link refetchSchema} from the
 * infrastructure layer and provides summary statistics about the fetched schema.
 */

import { parse, type DefinitionNode } from "graphql";
import { loadConfig } from "../config.js";
import { getCurrentEnv } from "../env-context.js";
import { refetchSchema } from "../schema.js";

/** Result returned after fetching and analyzing a schema. */
export interface SchemaFetchResult {
  readonly name: string;
  readonly typeCount: number;
  readonly queryFields: number;
  readonly mutationFields: number;
}

/**
 * Fetches the schema for the given (or active) environment and returns
 * summary statistics: type count, query field count, and mutation field count.
 *
 * @param environment - Target environment name. Defaults to the active environment.
 */
export async function fetchSchemaForEnv(environment?: string): Promise<SchemaFetchResult> {
  let name: string;
  let env;

  if (environment) {
    const config = await loadConfig();
    const target = config.environments[environment];
    if (!target) {
      throw new Error(`Environment "${environment}" not found.`);
    }
    name = environment;
    env = target;
  } else {
    const active = await getCurrentEnv();
    name = active.name;
    env = active.env;
  }

  const sdl = await refetchSchema(env, name);

  try {
    const doc = parse(sdl);
    const typeCount = doc.definitions.filter(
      (d) => d.kind === "ObjectTypeDefinition"
    ).length;
    const queryFields = countFieldsForType(doc.definitions, "Query");
    const mutationFields = countFieldsForType(doc.definitions, "Mutation");
    return { name, typeCount, queryFields, mutationFields };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Schema cached for environment "${name}" (source: ${env.schemaSource ?? "introspection"}) could not be parsed: ${message}`
    );
  }
}

/** Counts the number of fields on a named object type definition within the parsed schema. */
function countFieldsForType(definitions: readonly DefinitionNode[], typeName: string): number {
  const typeDef = definitions.find(
    (d) => d.kind === "ObjectTypeDefinition" && d.name.value === typeName
  );
  if (typeDef && "fields" in typeDef) {
    return typeDef.fields?.length ?? 0;
  }
  return 0;
}

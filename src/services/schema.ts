import { getActiveEnv, loadConfig } from "../config.js";
import { refetchSchema } from "../schema.js";

export interface SchemaFetchResult {
  readonly name: string;
  readonly typeCount: number;
  readonly queryFields: number;
  readonly mutationFields: number;
}

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
    const active = await getActiveEnv();
    name = active.name;
    env = active.env;
  }

  const sdl = await refetchSchema(env, name);

  const typeMatches = sdl.match(/^type\s+\w+/gm);
  const typeCount = typeMatches?.length ?? 0;

  const queryMatch = sdl.match(/type Query \{([^}]*)\}/s);
  const queryFields = queryMatch
    ? queryMatch[1].split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).length
    : 0;

  const mutationMatch = sdl.match(/type Mutation \{([^}]*)\}/s);
  const mutationFields = mutationMatch
    ? mutationMatch[1].split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).length
    : 0;

  return { name, typeCount, queryFields, mutationFields };
}

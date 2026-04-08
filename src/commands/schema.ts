/** @module commands/schema — CLI command for fetching and caching the GraphQL schema. */

import { Command } from "commander";
import { fetchSchemaForEnv } from "../services/schema.js";
import { printSuccess, handleError } from "../output.js";

/** Creates the `vex schema` command group with a `fetch` subcommand. */
export function createSchemaCommand(): Command {
  const schema = new Command("schema").description("Schema operations");

  schema
    .command("fetch")
    .description("Fetch and cache the GraphQL schema")
    .option("--env <name>", "Target environment (defaults to active)")
    .action(async (opts) => {
      try {
        const result = await fetchSchemaForEnv(opts.env);
        printSuccess(
          `Schema refreshed for "${result.name}" — ${result.typeCount} types, ${result.queryFields} queries, ${result.mutationFields} mutations`
        );
      } catch (err) {
        handleError(err);
      }
    });

  return schema;
}

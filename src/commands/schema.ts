/** @module commands/schema — CLI command for fetching and caching the GraphQL schema. */

import { Command } from "commander";
import { fetchSchemaForEnv, listPermissionsForCurrentEnv } from "../services/schema.js";
import { printSuccess, printJson, printTable, printInfo, handleError } from "../output.js";

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

  schema
    .command("permissions")
    .description("List all Permission enum values from the schema (incl. custom plugin permissions)")
    .option("--json", "Print machine-readable JSON output")
    .action(async (opts: { json?: boolean }) => {
      try {
        const permissions = await listPermissionsForCurrentEnv();
        if (opts.json) {
          printJson(permissions);
          return;
        }
        if (permissions.length === 0) {
          printInfo("No Permission enum found in the schema.");
          return;
        }
        printTable(
          ["Permission", "Description"],
          permissions.map((p) => [p.name, p.description ?? ""])
        );
      } catch (err) {
        handleError(err);
      }
    });

  return schema;
}

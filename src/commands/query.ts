/** @module commands/query — CLI command for executing raw GraphQL queries. */

import { Command } from "commander";
import { executeQuery } from "../services/query.js";
import { printJson, handleError } from "../output.js";

/** Creates the `vex query` command for executing arbitrary GraphQL queries. */
export function createQueryCommand(): Command {
  return new Command("query")
    .description("Execute a GraphQL query")
    .argument("<graphql>", "GraphQL query string")
    .option("--variables <json>", "Variables as JSON string")
    .action(async (graphql: string, opts) => {
      try {
        const variables = opts.variables ? JSON.parse(opts.variables) : undefined;
        const data = await executeQuery(graphql, variables);
        printJson(data);
      } catch (err) {
        handleError(err);
      }
    });
}

/** @module commands/mutate — CLI command for executing raw GraphQL mutations. */

import { Command } from "commander";
import { executeMutation } from "../services/query.js";
import { printJson, handleError } from "../output.js";

/** Creates the `vex mutate` command for executing arbitrary GraphQL mutations. */
export function createMutateCommand(): Command {
  return new Command("mutate")
    .description("Execute a GraphQL mutation")
    .argument("<graphql>", "GraphQL mutation string")
    .option("--variables <json>", "Variables as JSON string")
    .action(async (graphql: string, opts) => {
      try {
        const variables = opts.variables ? JSON.parse(opts.variables) : undefined;
        const data = await executeMutation(graphql, variables);
        printJson(data);
      } catch (err) {
        handleError(err);
      }
    });
}

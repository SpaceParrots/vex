/** @module commands/query — CLI command for executing raw GraphQL queries. */

import { Command } from "commander";
import { executeQuery } from "../services/query.js";
import { INPUT_HELP, resolveOperationInput } from "../cli-input.js";
import { printJson, handleError } from "../output.js";

/** Creates the `vex query` command for executing arbitrary GraphQL queries. */
export function createQueryCommand(): Command {
  return new Command("query")
    .description("Execute a GraphQL query")
    .argument("<graphql>", "Inline GraphQL query, a path to a .graphql file, or - for stdin (see below)")
    .option("--variables <json|file>", "Variables as inline JSON, a path to a .json file, or - for stdin (see below)")
    .addHelpText("after", INPUT_HELP)
    .action(async (graphql: string, opts: { variables?: string }) => {
      try {
        const { document, variables } = await resolveOperationInput({ document: graphql, variables: opts.variables });
        const data = await executeQuery(document, variables);
        printJson(data);
      } catch (err) {
        handleError(err);
      }
    });
}

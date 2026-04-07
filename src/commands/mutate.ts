import { Command } from "commander";
import { executeMutation } from "../services/query.js";
import { printJson, handleError } from "../output.js";

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

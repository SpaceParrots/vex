import { Command } from "commander";
import { executeQuery } from "../services/query.js";
import { printJson, handleError } from "../output.js";

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

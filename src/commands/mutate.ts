/** @module commands/mutate — CLI command for executing raw GraphQL mutations. */

import { Command, InvalidArgumentError } from "commander";
import { executeMutation, executeMutationWithFiles } from "../services/query.js";
import { printJson, handleError } from "../output.js";
import { INPUT_HELP, resolveOperationInput } from "../cli-input.js";

/** Accumulates repeated `--file varPath=filePath` mappings into one record. */
function collectFileMapping(value: string, prev: Record<string, string>): Record<string, string> {
  const eq = value.indexOf("=");
  if (eq <= 0) {
    throw new InvalidArgumentError('Expected --file "variable.path=./local/file" (e.g. "input.0.file=./logo.png").');
  }
  return { ...prev, [value.slice(0, eq)]: value.slice(eq + 1) };
}

/** Creates the `vex mutate` command for executing arbitrary GraphQL mutations. */
export function createMutateCommand(): Command {
  return new Command("mutate")
    .description("Execute a GraphQL mutation")
    .argument("<graphql>", "Inline GraphQL mutation, a path to a .graphql file, or - for stdin (see below)")
    .option("--variables <json|file>", "Variables as inline JSON, a path to a .json file, or - for stdin (see below)")
    .option(
      "--file <varPath=filePath>",
      "Attach a local file to an Upload variable (repeatable)",
      collectFileMapping,
      {}
    )
    .addHelpText("after", INPUT_HELP)
    .action(async (graphql: string, opts: { variables?: string; file: Record<string, string> }) => {
      try {
        const { document, variables } = await resolveOperationInput({ document: graphql, variables: opts.variables });
        const data =
          Object.keys(opts.file).length > 0
            ? await executeMutationWithFiles(document, variables, opts.file)
            : await executeMutation(document, variables);
        printJson(data);
      } catch (err) {
        handleError(err);
      }
    });
}

/** @module commands/build — CLI entry to the GraphQL operation builder wizard. */

import { Command } from "commander";
import { runWizard } from "../wizard/run.js";
import { handleError } from "../output.js";

interface BuildOpts {
  query?: string | true;
  mutation?: string | true;
  fragment?: string;
  maxDepth?: number;
  dryRun?: boolean;
  verbose?: boolean;
  save?: string;
  overwrite?: boolean;
}

export function createBuildCommand(): Command {
  const cmd = new Command("build")
    .description("Interactively build and execute a GraphQL operation")
    .option("-q, --query [name]", "Build a query (optionally pre-selected by name)")
    .option("-m, --mutation [name]", "Build a mutation (optionally pre-selected by name)")
    .option("--fragment <name>", "Use a saved fragment for field selection (skips selector)")
    .option("--max-depth <n>", "Override the flat-path selector max depth", (v) => Number(v))
    .option("--dry-run", "Print the constructed GraphQL document and exit without executing")
    .option("--verbose", "Also print the rendered GraphQL document and variables before executing (default: response only)")
    .option("--save <name>", "Persist the built operation (document + variables) for later replay with `vex run`")
    .option("--overwrite", "Allow --save to replace an existing saved operation with the same name")
    .addHelpText(
      "after",
      `
Examples:
  $ vex build -q customers
      Interactive: pick an operation, prompt for variables, pick fields, run it.
  $ vex build -q contents --dry-run
      Build a query but print it instead of executing.
  $ vex build -q orders --fragment OrderSummary
      Use a saved fragment for the field selection and skip the field picker.
  $ vex build -q contents --save ContentsPublished --dry-run
      Build, save under a name, and exit without hitting the server.
  $ vex build -m createCustomer --save NewCustomer --overwrite
      Persist (overwriting an existing entry) — replay later with \`vex run NewCustomer\`.
`
    )
    .action(async (opts: BuildOpts) => {
      try {
        const isQuery = opts.query !== undefined;
        const isMutation = opts.mutation !== undefined;
        if (isQuery && isMutation) {
          throw new Error("Pass either -q or -m, not both.");
        }
        if (!isQuery && !isMutation) {
          throw new Error("Specify -q (query) or -m (mutation).");
        }
        const kind: "query" | "mutation" = isQuery ? "query" : "mutation";
        const operationName =
          (isQuery && typeof opts.query === "string" ? opts.query : undefined) ??
          (isMutation && typeof opts.mutation === "string" ? opts.mutation : undefined);

        await runWizard({
          kind,
          operationName,
          fragmentName: opts.fragment,
          maxDepth: opts.maxDepth,
          dryRun: Boolean(opts.dryRun),
          verbose: Boolean(opts.verbose),
          saveAs: opts.save,
          overwriteSaved: Boolean(opts.overwrite),
        });
      } catch (err) {
        handleError(err);
      }
    });

  return cmd;
}

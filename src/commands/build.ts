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
  quiet?: boolean;
}

export function createBuildCommand(): Command {
  const cmd = new Command("build")
    .description("Interactively build and execute a GraphQL operation")
    .option("-q, --query [name]", "Build a query (optionally pre-selected by name)")
    .option("-m, --mutation [name]", "Build a mutation (optionally pre-selected by name)")
    .option("--fragment <name>", "Use a saved fragment for field selection (skips selector)")
    .option("--max-depth <n>", "Override the flat-path selector max depth", (v) => Number(v))
    .option("--dry-run", "Print the constructed GraphQL document and exit without executing")
    .option("--quiet", "Skip the GraphQL preview, just print the response")
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
          quiet: Boolean(opts.quiet),
        });
      } catch (err) {
        handleError(err);
      }
    });

  return cmd;
}

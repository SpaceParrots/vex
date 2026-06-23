/** @module commands/run — CLI command for executing a saved GraphQL operation by name. */

import { Command } from "commander";
import { getCurrentEnv } from "../env-context.js";
import { getClient } from "../client.js";
import {
  loadOperation,
  mergeVariables,
  parseVarPairs,
} from "../services/operations.js";
import { printInfo, handleError } from "../output.js";

interface RunOpts {
  var?: string[];
  varsJson?: string;
  dryRun?: boolean;
  verbose?: boolean;
}

function collectVar(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

export function createRunCommand(): Command {
  return new Command("run")
    .description("Execute a saved GraphQL operation by name (use `vex operation list` to discover names)")
    .argument("<name>", "Name of the saved operation")
    .option(
      "--var <key=value>",
      "Override a top-level variable (repeatable). Value is JSON-parsed when valid, otherwise treated as a string.",
      collectVar,
      []
    )
    .option(
      "--vars-json <json>",
      "Replace the entire variables object with the given JSON value (applied before --var)"
    )
    .option("--dry-run", "Print the document + final variables without executing")
    .option("--verbose", "Also print the document and final variables before executing (default: response only)")
    .addHelpText(
      "after",
      `
Examples:
  $ vex run ContentsPublished
      Replay and print only the response (default).
  $ vex run ContentsPublished --verbose
      Also print the rendered document and final variables.
  $ vex run ContentsPublished --var "options={\\"take\\":5}"
      Override one top-level variable (value is JSON-parsed when valid).
  $ vex run ContentsPublished --var "options={\\"filter\\":{\\"isPublished\\":{\\"eq\\":true}}}"
      Booleans/numbers go in as their real JSON types, never as strings.
  $ vex run ContentsPublished --vars-json '{"options":{"take":50}}' --dry-run
      Replace all variables, print the document, do not execute.

Use \`vex operation list\` to see saved names.
`
    )
    .action(async (name: string, opts: RunOpts) => {
      try {
        const { name: envName } = await getCurrentEnv();
        const rec = await loadOperation({ envName, name });

        let variables: Record<string, unknown> = rec.variables as Record<string, unknown>;
        if (opts.varsJson !== undefined) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(opts.varsJson);
          } catch (err) {
            throw new Error(`Invalid --vars-json: ${(err as Error).message}`);
          }
          if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("--vars-json must be a JSON object.");
          }
          // Round-trip through mergeVariables so reserved-key guards apply uniformly.
          variables = mergeVariables({}, parsed as Record<string, unknown>);
        }
        if (opts.var && opts.var.length > 0) {
          variables = mergeVariables(variables, parseVarPairs(opts.var));
        }

        if (opts.verbose) {
          printInfo("--- GraphQL ---");
          printInfo(rec.document);
          printInfo("--- Variables ---");
          printInfo(JSON.stringify(variables, null, 2));
        }

        if (opts.dryRun) {
          printInfo("Dry run — no request sent.");
          return;
        }

        const client = await getClient();
        const data = await client.request(rec.document, variables);
        if (opts.verbose) printInfo("--- Response ---");
        printInfo(JSON.stringify(data, null, 2));
      } catch (err) {
        handleError(err);
      }
    });
}

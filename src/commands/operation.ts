/** @module commands/operation — CLI subcommands for managing saved GraphQL operations. */

import { Command } from "commander";
import { getCurrentEnv } from "../env-context.js";
import {
  listOperations,
  loadOperation,
  deleteOperation,
} from "../services/operations.js";
import { printInfo, printJson, printSuccess, printTable, handleError } from "../output.js";

export function createOperationCommand(): Command {
  const op = new Command("operation").description("Manage saved GraphQL operations");

  op.command("list")
    .description("List saved operations for the active environment")
    .option("--kind <kind>", "Filter by kind: query or mutation")
    .option("--root-field <name>", "Filter by the root field the operation targets")
    .action(async (opts: { kind?: "query" | "mutation"; rootField?: string }) => {
      try {
        const { name: envName } = await getCurrentEnv();
        const all = await listOperations({
          envName,
          kind: opts.kind,
          rootField: opts.rootField,
        });
        if (all.length === 0) {
          printInfo("No saved operations.");
          return;
        }
        printTable(
          ["Name", "Kind", "Root", "Updated"],
          all.map((m) => [m.name, m.kind, m.rootField, m.updatedAt])
        );
      } catch (err) {
        handleError(err);
      }
    });

  op.command("show <name>")
    .description("Print a saved operation's document and default variables")
    .option("--json", "Output the full JSON record")
    .action(async (name: string, opts: { json?: boolean }) => {
      try {
        const { name: envName } = await getCurrentEnv();
        const rec = await loadOperation({ envName, name });
        if (opts.json) {
          printJson(rec);
          return;
        }
        printInfo(`# ${rec.name} (${rec.kind} ${rec.rootField})`);
        printInfo(`# updated ${rec.updatedAt}`);
        printInfo("");
        printInfo(rec.document);
        printInfo("");
        printInfo("--- Default variables ---");
        printInfo(JSON.stringify(rec.variables, null, 2));
      } catch (err) {
        handleError(err);
      }
    });

  op.command("delete <name>")
    .description("Delete a saved operation")
    .action(async (name: string) => {
      try {
        const { name: envName } = await getCurrentEnv();
        const result = await deleteOperation({ envName, name });
        if (result.deleted) printSuccess(`Operation "${name}" deleted.`);
        else printInfo(`Operation "${name}" not found.`);
      } catch (err) {
        handleError(err);
      }
    });

  return op;
}

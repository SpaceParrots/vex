/** @module commands/fragment — CLI subcommands for managing saved GraphQL fragments. */

import { Command } from "commander";
import { getCurrentEnv } from "../env-context.js";
import {
  listFragments,
  getFragmentSdl,
  deleteFragment,
} from "../services/fragments.js";
import { printTable, printInfo, printSuccess, handleError } from "../output.js";

export function createFragmentCommand(): Command {
  const cmd = new Command("fragment").description("Manage saved GraphQL fragments");

  cmd
    .command("list")
    .description("List saved fragments for the active environment")
    .option("--type <name>", "Filter by on-clause type name")
    .action(async (opts: { type?: string }) => {
      try {
        const { name } = await getCurrentEnv();
        const all = await listFragments({ envName: name, onType: opts.type });
        if (all.length === 0) {
          printInfo("No fragments saved.");
          return;
        }
        printTable(
          ["Name", "On Type", "Fields"],
          all.map((f) => [f.name, f.onType, String(f.fields)])
        );
      } catch (err) {
        handleError(err);
      }
    });

  cmd
    .command("show <name>")
    .description("Print the SDL of a saved fragment")
    .action(async (name: string) => {
      try {
        const { name: envName } = await getCurrentEnv();
        const sdl = await getFragmentSdl({ envName, name });
        printInfo(sdl);
      } catch (err) {
        handleError(err);
      }
    });

  cmd
    .command("delete <name>")
    .description("Delete a saved fragment")
    .action(async (name: string) => {
      try {
        const { name: envName } = await getCurrentEnv();
        const result = await deleteFragment({ envName, name });
        if (result.deleted) {
          printSuccess(`Fragment "${name}" deleted.`);
        } else {
          printInfo(`Fragment "${name}" not found.`);
        }
      } catch (err) {
        handleError(err);
      }
    });

  return cmd;
}

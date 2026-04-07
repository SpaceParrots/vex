import { Command } from "commander";
import {
  addEnvironment,
  removeEnvironment,
  switchEnvironment,
  updateEnvironment,
  listEnvironments,
  showEnvironment,
} from "../services/env.js";
import { printJson, printSuccess, printTable, handleError } from "../output.js";

export function createEnvCommand(): Command {
  const env = new Command("env").description("Manage Vendure environments");

  env
    .command("add <name>")
    .description("Add a new environment")
    .requiredOption("--url <url>", "Vendure Admin API URL")
    .requiredOption("--api-key <key>", "Vendure API key")
    .option("--schema-type <type>", "Schema source: endpoint or file")
    .option("--schema-value <value>", "Schema source value")
    .option("--fetch-schema", "Fetch schema immediately")
    .action(async (name: string, opts) => {
      try {
        const result = await addEnvironment({
          name,
          url: opts.url,
          apiKey: opts.apiKey,
          schemaType: opts.schemaType,
          schemaValue: opts.schemaValue,
          fetchSchema: opts.fetchSchema,
        });

        let msg = `Environment "${result.name}" added.`;
        if (result.isActive) msg += " Set as active.";
        if (result.schemaFetched) msg += " Schema fetched.";
        if (result.schemaError) msg += ` Schema fetch failed: ${result.schemaError}`;
        printSuccess(msg);
      } catch (err) {
        handleError(err);
      }
    });

  env
    .command("list")
    .description("List all environments")
    .action(async () => {
      try {
        const { active, environments } = await listEnvironments();
        const entries = Object.entries(environments);
        if (entries.length === 0) {
          console.log("No environments configured. Use `vex env add` to create one.");
          return;
        }
        printTable(
          ["Name", "URL", "Active"],
          entries.map(([n, e]) => [n, e.url, n === active ? "yes" : ""])
        );
      } catch (err) {
        handleError(err);
      }
    });

  env
    .command("switch <name>")
    .description("Switch the active environment")
    .action(async (name: string) => {
      try {
        await switchEnvironment(name);
        printSuccess(`Switched to "${name}".`);
      } catch (err) {
        handleError(err);
      }
    });

  env
    .command("remove <name>")
    .description("Remove an environment")
    .action(async (name: string) => {
      try {
        await removeEnvironment(name);
        printSuccess(`Environment "${name}" removed.`);
      } catch (err) {
        handleError(err);
      }
    });

  env
    .command("set <name>")
    .description("Update a configuration field of an environment")
    .option("--url <url>", "New Vendure Admin API URL")
    .option("--api-key <key>", "New Vendure API key")
    .option("--schema-type <type>", "Schema source: endpoint or file")
    .option("--schema-value <value>", "Schema source value")
    .action(async (name: string, opts) => {
      try {
        const updated = await updateEnvironment({
          name,
          url: opts.url,
          apiKey: opts.apiKey,
          schemaType: opts.schemaType,
          schemaValue: opts.schemaValue,
        });
        printSuccess(`Environment "${name}" updated: ${updated.join(", ")}.`);
      } catch (err) {
        handleError(err);
      }
    });

  env
    .command("show [name]")
    .description("Show environment details")
    .action(async (name?: string) => {
      try {
        const info = await showEnvironment(name);
        printJson(info);
      } catch (err) {
        handleError(err);
      }
    });

  return env;
}

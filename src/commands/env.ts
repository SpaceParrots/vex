/** @module commands/env — CLI subcommands for managing Vendure environments (add, list, switch, remove, set, show). */

import { Command } from "commander";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
  addEnvironment,
  removeEnvironment,
  switchEnvironment,
  updateEnvironment,
  listEnvironments,
  showEnvironment,
  statusEnvironment,
  currentEnvLine,
} from "../services/env.js";
import { getSchemaPath } from "../config.js";
import { runEnvAddWizard } from "../wizard/envAdd.js";
import { printJson, printSuccess, printInfo, printTable, handleError } from "../output.js";

/** Creates the `vex env` command group with add, list, switch, remove, set, and show subcommands. */
export function createEnvCommand(): Command {
  const env = new Command("env").description("Manage Vendure environments").addHelpText(
    "after",
    `
Examples:
  $ vex env add dev
      Interactive: prompts for URL, API key, and validates by fetching the schema.
  $ vex env add staging --url https://api.example.com/admin-api --api-key sk-xxx
      Non-interactive: validates schema fetch unless --no-validate is passed.
  $ vex env add prod --url https://api.example.com/admin-api --api-key sk-yyy \\
      --schema-type file --schema-value ./schema-admin.graphql
      Skip introspection by pointing to a local SDL file (useful when introspection is disabled).
  $ vex env status dev
      Check endpoint reachability + schema accessibility (exits non-zero on failure).
`
  );

  env
    .command("add <name>")
    .description("Add a new environment (interactive when --url or --api-key is missing)")
    .option("--url <url>", "Vendure Admin API URL")
    .option("--api-key <key>", "Vendure API key")
    .option("--schema-type <type>", "Schema source: endpoint or file")
    .option("--schema-value <value>", "Schema source value")
    .option("--no-validate", "Skip schema-fetch validation (non-interactive only)")
    .action(async (name: string, opts) => {
      try {
        const interactive = !opts.url || !opts.apiKey;
        let url: string = opts.url ?? "";
        let apiKey: string = opts.apiKey ?? "";
        let schemaType: "endpoint" | "file" | undefined = opts.schemaType;
        let schemaValue: string | undefined = opts.schemaValue;
        let cachedSdl: string | undefined;

        if (interactive) {
          const wiz = await runEnvAddWizard({
            name,
            url: opts.url,
            apiKey: opts.apiKey,
            schemaType: opts.schemaType,
            schemaValue: opts.schemaValue,
          });
          url = wiz.result.url;
          apiKey = wiz.result.apiKey;
          schemaType = wiz.result.schemaType;
          schemaValue = wiz.result.schemaValue;
          cachedSdl = wiz.sdl || undefined;
        }

        const fetchSchema = !interactive && opts.validate !== false && !cachedSdl;

        const result = await addEnvironment({
          name,
          url,
          apiKey,
          schemaType,
          schemaValue,
          fetchSchema,
        });

        if (cachedSdl) {
          const schemaPath = getSchemaPath(name);
          await mkdir(dirname(schemaPath), { recursive: true });
          await writeFile(schemaPath, cachedSdl, "utf-8");
        }

        let msg = `Environment "${result.name}" added.`;
        if (result.isActive) msg += " Set as active.";
        if (cachedSdl) msg += " Schema cached.";
        else if (result.schemaFetched) msg += " Schema fetched.";
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
          printInfo("No environments configured. Use `vex env add` to create one.");
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
    .command("set [name]")
    .description("Update a configuration field of an environment (defaults to active)")
    .option("--url <url>", "New Vendure Admin API URL")
    .option("--api-key <key>", "New Vendure API key")
    .option("--schema-type <type>", "Schema source: endpoint or file")
    .option("--schema-value <value>", "Schema source value")
    .action(async (name: string | undefined, opts) => {
      try {
        const result = await updateEnvironment({
          name,
          url: opts.url,
          apiKey: opts.apiKey,
          schemaType: opts.schemaType,
          schemaValue: opts.schemaValue,
        });
        printSuccess(`Environment "${result.name}" updated: ${result.updated.join(", ")}.`);
      } catch (err) {
        handleError(err);
      }
    });

  env
    .command("show [name]")
    .description("Show environment details (defaults to active)")
    .action(async (name: string | undefined) => {
      try {
        const info = await showEnvironment(name);
        printJson(info);
      } catch (err) {
        handleError(err);
      }
    });

  env
    .command("status [name]")
    .description("Check endpoint reachability and schema accessibility (defaults to active)")
    .option("--json", "Print machine-readable JSON output")
    .action(async (name: string | undefined, opts: { json?: boolean }) => {
      try {
        const status = await statusEnvironment(name);
        if (opts.json) {
          printJson(status);
          if (!status.endpoint.ok || !status.schema.ok) process.exit(1);
          return;
        }
        const mark = (c: { ok: boolean }): string => (c.ok ? "OK " : "ERR");
        printInfo(`Environment: ${status.name}${status.active ? " (active)" : ""}`);
        printInfo(`URL:         ${status.url}`);
        printInfo(`Endpoint:    ${mark(status.endpoint)}  ${status.endpoint.detail}`);
        printInfo(`Schema:      ${mark(status.schema)}  ${status.schema.detail}`);
        if (!status.endpoint.ok || !status.schema.ok) process.exit(1);
      } catch (err) {
        handleError(err);
      }
    });

  env
    .command("current")
    .description("Show which environment is currently in use (env param > VEX_ENV > active)")
    .action(async () => {
      try {
        printInfo(await currentEnvLine());
      } catch (err) {
        handleError(err);
      }
    });

  return env;
}

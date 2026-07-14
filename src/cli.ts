/**
 * @module cli
 *
 * Constructs the Commander CLI program with all entity subcommands.
 * Each subcommand delegates to a `createXxxCommand()` factory in `commands/`.
 */

import { createRequire } from "node:module";
import { Command } from "commander";
import { createEnvCommand } from "./commands/env.js";
import { createStatusCommand } from "./commands/status.js";
import { createMcpCommand } from "./commands/mcp.js";
import { createQueryCommand } from "./commands/query.js";
import { createMutateCommand } from "./commands/mutate.js";
import { createCustomerCommand } from "./commands/customer.js";
import { createProductCommand } from "./commands/product.js";
import { createOrderCommand } from "./commands/order.js";
import { createSchemaCommand } from "./commands/schema.js";
import { createZoneCommand } from "./commands/zone.js";
import { createTaxCommand } from "./commands/tax.js";
import { createChannelCommand } from "./commands/channel.js";
import { createAssetCommand } from "./commands/asset.js";
import { createFragmentCommand } from "./commands/fragment.js";
import { createBuildCommand } from "./commands/build.js";
import { createOperationCommand } from "./commands/operation.js";
import { createRunCommand } from "./commands/run.js";
import { enterEnvContext } from "./context.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

/**
 * Instinctive top-level shortcuts → canonical subcommand form.
 * `vex products --take 5` behaves exactly like `vex product list --take 5`.
 */
const SHORTCUTS: Readonly<Record<string, readonly string[]>> = {
  envs: ["env", "list"],
  products: ["product", "list"],
  customers: ["customer", "list"],
  orders: ["order", "list"],
  assets: ["asset", "list"],
  channels: ["channel", "list"],
  zones: ["zone", "list"],
  fragments: ["fragment", "list"],
  operations: ["operation", "list"],
  use: ["env", "switch"],
};

/**
 * Expands a shortcut in the first CLI argument (after node + script),
 * e.g. `vex products --take 5` → `vex product list --take 5`.
 * Returns argv unchanged when no shortcut matches.
 */
export function expandShortcuts(argv: readonly string[]): readonly string[] {
  const [node, script, first, ...rest] = argv;
  const expansion = first !== undefined ? SHORTCUTS[first] : undefined;
  return expansion ? [node, script, ...expansion, ...rest] : argv;
}

/** Creates and returns the root Commander program with all registered subcommands. */
export function createCli(): Command {
  const program = new Command();

  program
    .name("vex")
    .description("CLI and MCP server for Vendure Admin API")
    .version(version)
    .showSuggestionAfterError()
    .option(
      "--env <name>",
      "Target environment for this command (overrides VEX_ENV and the active env)"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ vex env add dev                          # interactive: prompts for URL, API key, and validates the schema
  $ vex env status dev                       # check endpoint reachability + schema accessibility
  $ vex build -q customers                   # interactively build & run a query, with field picker
  $ vex build -q contents --save ContentsPublished
                                             # save the built operation for replay
  $ vex run ContentsPublished --var "options={\\"take\\":5}"
                                             # replay a saved op with a variable override
  $ vex                                      # (no args) start MCP server on stdio for Claude / other clients

Reusable building blocks:
  fragments    field selections you reuse across operations  (vex fragment ...)
  operations   full queries/mutations with default variables (vex operation ...)

Shortcuts:
  vex envs | products | customers | orders | assets | channels | zones | fragments | operations
               list the domain (same flags as the list subcommand)
  vex use <env>                              switch the active environment
  vex status                                 health panel for the current environment
`
    );

  program.hook("preAction", (_thisCommand, actionCommand) => {
    const env = actionCommand.optsWithGlobals().env as string | undefined;
    enterEnvContext(env);
  });

  program.addCommand(createEnvCommand());
  program.addCommand(createStatusCommand());
  program.addCommand(createMcpCommand());
  program.addCommand(createQueryCommand());
  program.addCommand(createMutateCommand());
  program.addCommand(createCustomerCommand());
  program.addCommand(createProductCommand());
  program.addCommand(createOrderCommand());
  program.addCommand(createSchemaCommand());
  program.addCommand(createZoneCommand());
  program.addCommand(createTaxCommand());
  program.addCommand(createChannelCommand());
  program.addCommand(createAssetCommand());
  program.addCommand(createFragmentCommand());
  program.addCommand(createBuildCommand());
  program.addCommand(createOperationCommand());
  program.addCommand(createRunCommand());

  // Bare group commands (e.g. `vex product`) print their subcommand help.
  for (const cmd of program.commands) {
    if (cmd.commands.length > 0) {
      cmd.action(() => cmd.help());
    }
  }

  return program;
}

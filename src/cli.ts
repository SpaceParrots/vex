/**
 * @module cli
 *
 * Constructs the Commander CLI program with all entity subcommands.
 * Each subcommand delegates to a `createXxxCommand()` factory in `commands/`.
 */

import { createRequire } from "node:module";
import { Command } from "commander";
import { createEnvCommand } from "./commands/env.js";
import { createQueryCommand } from "./commands/query.js";
import { createMutateCommand } from "./commands/mutate.js";
import { createCustomerCommand } from "./commands/customer.js";
import { createProductCommand } from "./commands/product.js";
import { createOrderCommand } from "./commands/order.js";
import { createSchemaCommand } from "./commands/schema.js";
import { createZoneCommand } from "./commands/zone.js";
import { createTaxCommand } from "./commands/tax.js";
import { createChannelCommand } from "./commands/channel.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

/** Creates and returns the root Commander program with all registered subcommands. */
export function createCli(): Command {
  const program = new Command();

  program
    .name("vex")
    .description("CLI and MCP server for Vendure Admin API")
    .version(version);

  program.addCommand(createEnvCommand());
  program.addCommand(createQueryCommand());
  program.addCommand(createMutateCommand());
  program.addCommand(createCustomerCommand());
  program.addCommand(createProductCommand());
  program.addCommand(createOrderCommand());
  program.addCommand(createSchemaCommand());
  program.addCommand(createZoneCommand());
  program.addCommand(createTaxCommand());
  program.addCommand(createChannelCommand());

  return program;
}

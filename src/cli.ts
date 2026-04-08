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

export function createCli(): Command {
  const program = new Command();

  program
    .name("vex")
    .description("CLI and MCP server for Vendure Admin API")
    .version("0.2.0");

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

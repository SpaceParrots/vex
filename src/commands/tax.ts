/** @module commands/tax — CLI subcommands for tax category and tax rate management. */

import { Command } from "commander";
import {
  listTaxCategories,
  getTaxCategory,
  createTaxCategory,
  deleteTaxCategory,
  listTaxRates,
  getTaxRate,
  createTaxRate,
  updateTaxRate,
  deleteTaxRate,
} from "../services/tax.js";
import { printJson, printSuccess, handleError } from "../output.js";

/** Creates the `vex tax` command group with category and rate subcommands. */
export function createTaxCommand(): Command {
  const tax = new Command("tax").description("Tax operations");

  tax
    .command("list-categories")
    .description("List tax categories")
    .option("--take <n>", "Number of results", parseInt)
    .option("--skip <n>", "Offset", parseInt)
    .action(async (opts) => {
      try {
        const data = await listTaxCategories({
          take: opts.take,
          skip: opts.skip,
        });
        printJson(data);
      } catch (err) {
        handleError(err);
      }
    });

  tax
    .command("get-category <id>")
    .description("Get tax category by ID")
    .action(async (id: string) => {
      try {
        printJson(await getTaxCategory(id));
      } catch (err) {
        handleError(err);
      }
    });

  tax
    .command("create-category")
    .description("Create a new tax category")
    .requiredOption("--name <name>", "Tax category name")
    .option("--default", "Set as the default tax category")
    .action(async (opts) => {
      try {
        const data = await createTaxCategory({
          name: opts.name,
          isDefault: opts.default ?? undefined,
        });
        printJson(data);
      } catch (err) {
        handleError(err);
      }
    });

  tax
    .command("delete-category <id>")
    .description("Delete a tax category")
    .action(async (id: string) => {
      try {
        await deleteTaxCategory(id);
        printSuccess(`Tax category ${id} deleted.`);
      } catch (err) {
        handleError(err);
      }
    });

  tax
    .command("list-rates")
    .description("List tax rates")
    .option("--take <n>", "Number of results", parseInt)
    .option("--skip <n>", "Offset", parseInt)
    .action(async (opts) => {
      try {
        const data = await listTaxRates({
          take: opts.take,
          skip: opts.skip,
        });
        printJson(data);
      } catch (err) {
        handleError(err);
      }
    });

  tax
    .command("get-rate <id>")
    .description("Get tax rate by ID")
    .action(async (id: string) => {
      try {
        printJson(await getTaxRate(id));
      } catch (err) {
        handleError(err);
      }
    });

  tax
    .command("create-rate")
    .description("Create a new tax rate")
    .requiredOption("--name <name>", "Tax rate name (e.g. 'GST 18%')")
    .requiredOption("--value <n>", "Tax rate percentage (e.g. 18)", parseFloat)
    .requiredOption("--category-id <id>", "Tax category ID")
    .requiredOption("--zone-id <id>", "Zone ID")
    .option("--disabled", "Create the tax rate as disabled")
    .option("--customer-group-id <id>", "Customer group ID (optional)")
    .action(async (opts) => {
      try {
        const data = await createTaxRate({
          name: opts.name,
          value: opts.value,
          categoryId: opts.categoryId,
          zoneId: opts.zoneId,
          enabled: !opts.disabled,
          customerGroupId: opts.customerGroupId,
        });
        printJson(data);
      } catch (err) {
        handleError(err);
      }
    });

  tax
    .command("update-rate <id>")
    .description("Update a tax rate")
    .option("--name <name>", "New tax rate name")
    .option("--value <n>", "New tax rate percentage", parseFloat)
    .option("--enabled", "Enable the tax rate")
    .option("--disabled", "Disable the tax rate")
    .option("--category-id <id>", "New tax category ID")
    .option("--zone-id <id>", "New zone ID")
    .option("--customer-group-id <id>", "New customer group ID")
    .action(async (id: string, opts) => {
      try {
        let enabled: boolean | undefined;
        if (opts.enabled) enabled = true;
        if (opts.disabled) enabled = false;

        const data = await updateTaxRate({
          id,
          name: opts.name,
          value: opts.value,
          enabled,
          categoryId: opts.categoryId,
          zoneId: opts.zoneId,
          customerGroupId: opts.customerGroupId,
        });
        printJson(data);
      } catch (err) {
        handleError(err);
      }
    });

  tax
    .command("delete-rate <id>")
    .description("Delete a tax rate")
    .action(async (id: string) => {
      try {
        await deleteTaxRate(id);
        printSuccess(`Tax rate ${id} deleted.`);
      } catch (err) {
        handleError(err);
      }
    });

  return tax;
}

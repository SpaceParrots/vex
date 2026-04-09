/** @module commands/product — CLI subcommands for product management (list, get, create, update, delete, add-variants). */

import { Command } from "commander";
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  createProductVariants,
} from "../services/products.js";
import { printJson, printSuccess, handleError } from "../output.js";

/** Creates the `vex product` command group with list, get, create, update, delete, and add-variants subcommands. */
export function createProductCommand(): Command {
  const product = new Command("product").description("Product operations");

  product
    .command("list")
    .description("List products")
    .option("--take <n>", "Number of results", parseInt)
    .option("--skip <n>", "Offset", parseInt)
    .option("--name <filter>", "Filter by product name")
    .action(async (opts) => {
      try {
        const data = await listProducts({
          take: opts.take,
          skip: opts.skip,
          filterByName: opts.name,
        });
        printJson(data);
      } catch (err) {
        handleError(err);
      }
    });

  product
    .command("get <id>")
    .description("Get product by ID")
    .action(async (id: string) => {
      try {
        printJson(await getProduct(id));
      } catch (err) {
        handleError(err);
      }
    });

  product
    .command("create")
    .description("Create a new product")
    .requiredOption("--name <name>", "Product name")
    .requiredOption("--slug <slug>", "URL-friendly slug")
    .requiredOption("--description <desc>", "Product description")
    .option("--facet-value-ids <ids>", "Comma-separated facet value IDs")
    .action(async (opts) => {
      try {
        const data = await createProduct({
          name: opts.name,
          slug: opts.slug,
          description: opts.description,
          facetValueIds: opts.facetValueIds?.split(","),
        });
        printJson(data);
      } catch (err) {
        handleError(err);
      }
    });

  product
    .command("update <id>")
    .description("Update a product")
    .option("--name <name>", "New product name")
    .option("--slug <slug>", "New slug")
    .option("--description <desc>", "New description")
    .option("--enabled", "Enable the product")
    .option("--disabled", "Disable the product")
    .action(async (id: string, opts) => {
      try {
        let enabled: boolean | undefined;
        if (opts.enabled) enabled = true;
        if (opts.disabled) enabled = false;

        const data = await updateProduct({
          id,
          name: opts.name,
          slug: opts.slug,
          description: opts.description,
          enabled,
        });
        printJson(data);
      } catch (err) {
        handleError(err);
      }
    });

  product
    .command("delete <id>")
    .description("Delete a product")
    .action(async (id: string) => {
      try {
        await deleteProduct(id);
        printSuccess(`Product ${id} deleted.`);
      } catch (err) {
        handleError(err);
      }
    });

  product
    .command("add-variants <productId>")
    .description("Create variants for a product")
    .requiredOption("--variants <json>", "JSON array of variants: [{name, sku, price, stockOnHand?}]")
    .action(async (productId: string, opts) => {
      try {
        const variants = JSON.parse(opts.variants);
        const data = await createProductVariants({ productId, variants });
        printJson(data);
      } catch (err) {
        handleError(err);
      }
    });

  return product;
}

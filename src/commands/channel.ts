import { Command } from "commander";
import {
  listChannels,
  getChannel,
  getActiveChannel,
  updateChannel,
} from "../services/channels.js";
import { printJson, printSuccess, handleError } from "../output.js";

export function createChannelCommand(): Command {
  const channel = new Command("channel").description("Channel operations");

  channel
    .command("list")
    .description("List channels")
    .option("--take <n>", "Number of results", parseInt)
    .option("--skip <n>", "Offset", parseInt)
    .action(async (opts) => {
      try {
        const data = await listChannels({
          take: opts.take,
          skip: opts.skip,
        });
        printJson(data);
      } catch (err) {
        handleError(err);
      }
    });

  channel
    .command("get <id>")
    .description("Get channel by ID")
    .action(async (id: string) => {
      try {
        printJson(await getChannel(id));
      } catch (err) {
        handleError(err);
      }
    });

  channel
    .command("active")
    .description("Get the active channel")
    .action(async () => {
      try {
        printJson(await getActiveChannel());
      } catch (err) {
        handleError(err);
      }
    });

  channel
    .command("set-defaults <id>")
    .description("Update channel defaults (tax zone, shipping zone, etc.)")
    .option("--tax-zone-id <id>", "Default tax zone ID")
    .option("--shipping-zone-id <id>", "Default shipping zone ID")
    .option("--language <code>", "Default language code")
    .option("--currency <code>", "Default currency code")
    .option("--prices-include-tax", "Prices include tax")
    .option("--prices-exclude-tax", "Prices exclude tax")
    .option("--track-inventory", "Enable inventory tracking")
    .option("--no-track-inventory", "Disable inventory tracking")
    .option("--out-of-stock-threshold <n>", "Out of stock threshold", parseInt)
    .action(async (id: string, opts) => {
      try {
        let pricesIncludeTax: boolean | undefined;
        if (opts.pricesIncludeTax) pricesIncludeTax = true;
        if (opts.pricesExcludeTax) pricesIncludeTax = false;

        const data = await updateChannel({
          id,
          defaultTaxZoneId: opts.taxZoneId,
          defaultShippingZoneId: opts.shippingZoneId,
          defaultLanguageCode: opts.language,
          defaultCurrencyCode: opts.currency,
          pricesIncludeTax,
          trackInventory: opts.trackInventory,
          outOfStockThreshold: opts.outOfStockThreshold,
        });
        printJson(data);
      } catch (err) {
        handleError(err);
      }
    });

  return channel;
}

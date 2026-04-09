/** @module commands/zone — CLI subcommands for zone and country management (list, get, create, update, delete, add/remove-members, create-country, countries). */

import { Command } from "commander";
import {
  listZones,
  getZone,
  createZone,
  updateZone,
  deleteZone,
  addMembersToZone,
  removeMembersFromZone,
  createCountry,
  listCountries,
} from "../services/zones.js";
import { printJson, printSuccess, handleError } from "../output.js";

/** Creates the `vex zone` command group with zone and country subcommands. */
export function createZoneCommand(): Command {
  const zone = new Command("zone").description("Zone operations");

  zone
    .command("list")
    .description("List zones")
    .option("--take <n>", "Number of results", parseInt)
    .option("--skip <n>", "Offset", parseInt)
    .action(async (opts) => {
      try {
        const data = await listZones({
          take: opts.take,
          skip: opts.skip,
        });
        printJson(data);
      } catch (err) {
        handleError(err);
      }
    });

  zone
    .command("get <id>")
    .description("Get zone by ID")
    .action(async (id: string) => {
      try {
        printJson(await getZone(id));
      } catch (err) {
        handleError(err);
      }
    });

  zone
    .command("create")
    .description("Create a new zone")
    .requiredOption("--name <name>", "Zone name")
    .option("--member-ids <ids>", "Comma-separated country/region IDs")
    .action(async (opts) => {
      try {
        const data = await createZone({
          name: opts.name,
          memberIds: opts.memberIds?.split(","),
        });
        printJson(data);
      } catch (err) {
        handleError(err);
      }
    });

  zone
    .command("update <id>")
    .description("Update a zone")
    .option("--name <name>", "New zone name")
    .action(async (id: string, opts) => {
      try {
        const data = await updateZone({
          id,
          name: opts.name,
        });
        printJson(data);
      } catch (err) {
        handleError(err);
      }
    });

  zone
    .command("delete <id>")
    .description("Delete a zone")
    .action(async (id: string) => {
      try {
        await deleteZone(id);
        printSuccess(`Zone ${id} deleted.`);
      } catch (err) {
        handleError(err);
      }
    });

  zone
    .command("add-members <zoneId>")
    .description("Add countries/regions to a zone")
    .requiredOption("--member-ids <ids>", "Comma-separated country/region IDs")
    .action(async (zoneId: string, opts) => {
      try {
        const data = await addMembersToZone({
          zoneId,
          memberIds: opts.memberIds.split(","),
        });
        printJson(data);
      } catch (err) {
        handleError(err);
      }
    });

  zone
    .command("remove-members <zoneId>")
    .description("Remove countries/regions from a zone")
    .requiredOption("--member-ids <ids>", "Comma-separated country/region IDs")
    .action(async (zoneId: string, opts) => {
      try {
        const data = await removeMembersFromZone({
          zoneId,
          memberIds: opts.memberIds.split(","),
        });
        printJson(data);
      } catch (err) {
        handleError(err);
      }
    });

  zone
    .command("create-country")
    .description("Create a new country")
    .requiredOption("--name <name>", "Country name")
    .requiredOption("--code <code>", "ISO country code (e.g. IN, US, GB)")
    .option("--disabled", "Create the country as disabled")
    .action(async (opts) => {
      try {
        const data = await createCountry({
          name: opts.name,
          code: opts.code,
          enabled: !opts.disabled,
        });
        printJson(data);
      } catch (err) {
        handleError(err);
      }
    });

  zone
    .command("countries")
    .description("List available countries")
    .option("--take <n>", "Number of results", parseInt)
    .option("--skip <n>", "Offset", parseInt)
    .action(async (opts) => {
      try {
        const data = await listCountries({
          take: opts.take,
          skip: opts.skip,
        });
        printJson(data);
      } catch (err) {
        handleError(err);
      }
    });

  return zone;
}

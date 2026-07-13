/** @module commands/asset — CLI subcommands for Vendure assets (upload, list, get, update, delete). */

import { Command, InvalidArgumentError } from "commander";
import { text } from "@clack/prompts";
import {
  uploadAssets,
  listAssets,
  getAsset,
  updateAsset,
  deleteAsset,
} from "../services/assets.js";
import { printJson, printSuccess, printError, handleError } from "../output.js";
import { VexError } from "../errors.js";
import { unwrapCancel } from "../prompt.js";
import { isRecord } from "../guards.js";

/** Narrows one `createAssets` result entry to its `MimeTypeError` branch. */
function isMimeTypeError(
  entry: unknown
): entry is { readonly message: string; readonly fileName?: string; readonly mimeType?: string } {
  return isRecord(entry) && entry.__typename === "MimeTypeError";
}

/** Parses a `--tags a,b,c` value into a trimmed string array. */
function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Parses a `--focal x,y` value into a focal point object. */
function parseFocalPoint(value: string): { x: number; y: number } {
  const [x, y] = value.split(",").map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
    throw new InvalidArgumentError("Expected --focal x,y with numbers between 0 and 1 (e.g. 0.5,0.5).");
  }
  return { x, y };
}

/** Creates the `vex asset` command group. */
export function createAssetCommand(): Command {
  const asset = new Command("asset").description("Manage Vendure assets (images, files)").addHelpText(
    "after",
    `
Examples:
  $ vex asset upload ./logo.png ./hero.jpg --tags branding,homepage
  $ vex asset list --name logo --take 10
  $ vex asset update 42 --focal 0.5,0.3
`
  );

  asset
    .command("upload [files...]")
    .description("Upload local files as new assets (GraphQL multipart request)")
    .option("--tags <tags>", "Comma-separated tags applied to every uploaded asset", parseTags)
    .action(async (files: string[], opts: { tags?: string[] }) => {
      try {
        let filePaths = files;
        if (filePaths.length === 0) {
          if (process.stdin.isTTY !== true) {
            throw new VexError("No files given.", { hint: "Usage: vex asset upload <files...>" });
          }
          const answer = unwrapCancel(
            await text({
              message: "Path of the file to upload",
              validate: (v) => (v.trim().length === 0 ? "Enter a file path." : undefined),
            }),
            "Cancelled."
          );
          filePaths = [answer];
        }
        const result = await uploadAssets({ filePaths, tags: opts.tags });
        printJson(result);
        // createAssets returns a union array (Asset | MimeTypeError) — some files may
        // have uploaded successfully even if others were rejected, so we still print
        // the full result above, but a run where every file failed must not exit 0.
        if (Array.isArray(result)) {
          const failures = result.filter(isMimeTypeError);
          if (failures.length > 0) {
            for (const f of failures) {
              printError(`Rejected ${f.fileName ?? "(unknown file)"}: ${f.message}`);
            }
            process.exitCode = 1;
          }
        }
      } catch (err) {
        handleError(err);
      }
    });

  asset
    .command("list")
    .description("List assets")
    .option("--take <n>", "Number of assets to fetch", parseInt)
    .option("--skip <n>", "Number of assets to skip", parseInt)
    .option("--name <substring>", "Filter by name substring")
    .action(async (opts: { take?: number; skip?: number; name?: string }) => {
      try {
        printJson(await listAssets({ take: opts.take, skip: opts.skip, nameContains: opts.name }));
      } catch (err) {
        handleError(err);
      }
    });

  asset
    .command("get <id>")
    .description("Show one asset by ID")
    .action(async (id: string) => {
      try {
        printJson(await getAsset(id));
      } catch (err) {
        handleError(err);
      }
    });

  asset
    .command("update <id>")
    .description("Update an asset's name, tags, or focal point")
    .option("--name <name>", "New asset name")
    .option("--tags <tags>", "Comma-separated tags (replaces existing tags)", parseTags)
    .option("--focal <x,y>", "Focal point as fractions (e.g. 0.5,0.5)", parseFocalPoint)
    .action(async (id: string, opts: { name?: string; tags?: string[]; focal?: { x: number; y: number } }) => {
      try {
        printJson(await updateAsset({ id, name: opts.name, tags: opts.tags, focalPoint: opts.focal }));
      } catch (err) {
        handleError(err);
      }
    });

  asset
    .command("delete <id>")
    .description("Delete an asset by ID")
    .action(async (id: string) => {
      try {
        // deleteAsset() throws a VexError when the server refuses the delete
        // (result !== "DELETED"), so reaching printSuccess here means it truly succeeded.
        printJson(await deleteAsset(id));
        printSuccess(`Deleted asset ${id}.`);
      } catch (err) {
        handleError(err);
      }
    });

  return asset;
}

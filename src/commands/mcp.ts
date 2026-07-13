/**
 * @module commands/mcp
 *
 * `vex mcp` command group: writes/merges the vex server entry into a
 * project's `.mcp.json` (install) or prints the JSON snippet (config).
 * Interactive when required choices are missing and stdin is a TTY.
 */

import { Command } from "commander";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import * as p from "@clack/prompts";
import {
  buildVexServerEntry,
  mergeMcpJson,
  getExistingVexEntry,
  type McpInstallOptions,
} from "../services/mcp-config.js";
import { listEnvironments } from "../services/env.js";
import { linkProject, GETTING_STARTED_HINT } from "../config.js";
import { VexError } from "../errors.js";
import { printSuccess, printInfo, handleError } from "../output.js";

interface InstallFlags {
  readonly env?: string;
  readonly tools?: string;
  readonly npx?: boolean;
  readonly link: boolean; // Commander --no-link default true
  readonly yes?: boolean;
}

/** Exits via clack's cancel flow when the user aborts a prompt. */
function bail<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel("Cancelled.");
    process.exit(1);
  }
  return value;
}

/**
 * Asserts that `value` is a valid `--tools` mode ("full" or "lean").
 *
 * @throws {VexError} If `value` is anything else.
 */
function assertToolsMode(value: string): asserts value is "full" | "lean" {
  if (value !== "full" && value !== "lean") {
    throw new VexError(`Invalid --tools value "${value}".`, { hint: "Use --tools lean or --tools full." });
  }
}

/** Gathers install options from flags, prompting interactively on a TTY for anything missing. */
async function gatherOptions(flags: InstallFlags, targetDir: string): Promise<McpInstallOptions & { link: boolean }> {
  const { active, environments } = await listEnvironments();
  const names = Object.keys(environments);
  if (names.length === 0) {
    throw new VexError("No environments configured — nothing to install.", { hint: GETTING_STARTED_HINT });
  }

  const interactive = process.stdin.isTTY === true && !flags.yes && (!flags.env || !flags.tools);
  let envName = flags.env;
  let tools = flags.tools;
  let useNpx = flags.npx === true;
  let link = flags.link;

  if (interactive) {
    p.intro("vex mcp install");
    envName ??= bail(
      await p.select({
        message: "Environment for this project",
        options: names.map((n) => ({ value: n, label: n === active ? `${n} (active)` : n })),
        initialValue: names.includes(active) ? active : names[0],
      })
    );
    tools ??= bail(
      await p.select({
        message: "MCP tool surface",
        options: [
          { value: "lean", label: "lean — 6 universal tools, minimal token footprint (recommended)" },
          { value: "full", label: "full — all typed entity tools" },
        ],
        initialValue: "lean",
      })
    );
    if (flags.npx === undefined) {
      useNpx = bail(
        await p.confirm({
          message: "Invoke via npx instead of a globally installed `vex`?",
          initialValue: false,
        })
      );
    }
    link = bail(
      await p.confirm({
        message: `Also link ${targetDir} to "${envName}" so the CLI auto-selects it here?`,
        initialValue: flags.link,
      })
    );
  } else {
    envName ??= active;
    if (!envName) {
      throw new VexError("No environment selected and no active environment.", {
        hint: `Pass --env <name>. Available: ${names.join(", ")}.`,
      });
    }
    tools ??= "lean";
  }

  assertToolsMode(tools);
  if (!environments[envName]) {
    throw new VexError(`Environment "${envName}" not found.`, { hint: `Available: ${names.join(", ")}.` });
  }
  return { envName, tools, useNpx, link };
}

/** Runs the install flow: gather options, merge `.mcp.json`, optionally link the project. */
async function runInstall(dir: string | undefined, flags: InstallFlags): Promise<void> {
  const targetDir = resolve(dir ?? ".");
  const opts = await gatherOptions(flags, targetDir);

  const mcpPath = join(targetDir, ".mcp.json");
  const existingText = existsSync(mcpPath) ? await readFile(mcpPath, "utf-8") : undefined;
  const entry = buildVexServerEntry(opts);

  const existingEntry = getExistingVexEntry(existingText);
  if (existingEntry !== undefined && !flags.yes) {
    if (process.stdin.isTTY === true) {
      p.note(
        `current: ${JSON.stringify(existingEntry)}\nnew:     ${JSON.stringify(entry)}`,
        ".mcp.json already has a vex entry"
      );
      const overwrite = bail(await p.confirm({ message: "Overwrite it?", initialValue: true }));
      if (!overwrite) {
        p.cancel("Left .mcp.json unchanged.");
        process.exit(1);
      }
    } else {
      throw new VexError(`${mcpPath} already contains a vex entry.`, {
        hint: "Re-run with --yes to overwrite it.",
      });
    }
  }

  await writeFile(mcpPath, mergeMcpJson(existingText, entry), "utf-8");
  printSuccess(`${existingText ? "Updated" : "Created"} ${mcpPath} (env "${opts.envName}", ${opts.tools} tools).`);
  if (opts.link) {
    await linkProject(targetDir, opts.envName);
    printSuccess(`Linked ${targetDir} → "${opts.envName}".`);
  }
  printInfo("Restart your MCP client (e.g. Claude Code) to pick up the vex server.");
}

/** Creates the `vex mcp` command group (install, config). */
export function createMcpCommand(): Command {
  const mcp = new Command("mcp").description("Configure MCP clients to use vex").addHelpText(
    "after",
    `
Examples:
  $ vex mcp install                          # interactive: pick env + tool mode, write ./.mcp.json
  $ vex mcp install ../shop --env dev --tools lean --yes
  $ vex mcp config --env dev                 # print the JSON snippet without writing
`
  );

  mcp
    .command("install [dir]")
    .description("Create or update .mcp.json in a project directory (default: current directory)")
    .option("--env <name>", "Environment to pin via VEX_ENV")
    .option("--tools <mode>", "Tool surface: lean or full (default: lean)")
    .option("--npx", "Invoke via `npx -y @spaceparrots/vex` instead of a global vex")
    .option("--no-link", "Do not link the directory to the environment")
    .option("--yes", "Non-interactive: accept defaults and overwrite an existing vex entry")
    .action(async (dir: string | undefined, flags: InstallFlags) => {
      try {
        await runInstall(dir, flags);
      } catch (err) {
        handleError(err);
      }
    });

  mcp
    .command("config")
    .description("Print the .mcp.json snippet for vex without writing any file")
    .option("--env <name>", "Environment to pin via VEX_ENV (default: active)")
    .option("--tools <mode>", "Tool surface: lean or full (default: lean)")
    .option("--npx", "Invoke via npx instead of a global vex")
    .action(async (flags: { env?: string; tools?: string; npx?: boolean }) => {
      try {
        const { active, environments } = await listEnvironments();
        const envName = flags.env ?? active;
        if (!envName || !environments[envName]) {
          throw new VexError("No environment selected.", {
            hint: `Pass --env <name>. Available: ${Object.keys(environments).join(", ") || "(none)"}.`,
          });
        }
        const tools = flags.tools ?? "lean";
        assertToolsMode(tools);
        const entry = buildVexServerEntry({ envName, tools, useNpx: flags.npx === true });
        printInfo(JSON.stringify({ mcpServers: { vex: entry } }, null, 2));
      } catch (err) {
        handleError(err);
      }
    });

  return mcp;
}

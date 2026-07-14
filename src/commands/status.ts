/** @module commands/status — top-level `vex status` health panel. */

import { Command } from "commander";
import { statusReport } from "../services/status.js";
import { printInfo, printJson, handleError } from "../output.js";
import type { EnvSource } from "../context.js";

/** Human label for how the environment was selected. */
function sourceLabel(source: EnvSource, projectPath?: string): string {
  switch (source) {
    case "param":
      return "via --env flag";
    case "VEX_ENV":
      return "via VEX_ENV";
    case "project":
      return `via project link ${projectPath ?? ""}`.trim();
    case "active":
      return "active environment";
  }
}

/**
 * Creates the `vex status` command showing env, endpoint, schema, and config health.
 *
 * The process exit code (1 on failure) reflects endpoint reachability only; an
 * uncached schema is not treated as a failure because `vex schema fetch` self-heals it.
 */
export function createStatusCommand(): Command {
  return new Command("status")
    .description("Show which environment is in use, endpoint reachability, and schema freshness")
    .option("--json", "Print machine-readable JSON output")
    .action(async (opts: { json?: boolean }) => {
      try {
        const report = await statusReport();
        if (opts.json) {
          printJson(report);
          if (!report.endpoint.ok) process.exit(1);
          return;
        }
        const mark = report.endpoint.ok ? "OK " : "ERR";
        printInfo(`vex ${report.version}`);
        printInfo(`Env:        ${report.envName} (${sourceLabel(report.source, report.projectPath)})`);
        printInfo(`Endpoint:   ${report.url}  ${mark} ${report.endpoint.detail} (${report.endpoint.latencyMs}ms)`);
        printInfo(`API key:    ${report.apiKeyMasked}`);
        printInfo(`Schema:     ${report.schema.detail}`);
        printInfo(`Config:     ${report.configPath}`);
        if (!report.endpoint.ok) process.exit(1);
      } catch (err) {
        handleError(err);
      }
    });
}

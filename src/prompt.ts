/**
 * @module prompt
 *
 * Shared clack-cancel helpers used by every interactive CLI prompt flow
 * (wizard steps, `env`/`asset`/`mcp` commands). Before this module existed,
 * six near-identical `bail()` helpers each reported the clack cancel notice
 * and exited the process — five of them with exit code 130, one
 * (`commands/mcp.ts`) with exit code 1 — so cancelling one prompt reported a
 * different exit code to the shell than cancelling another. This module is
 * the single source of truth: every cancel path now exits 130 (128 +
 * SIGINT), the shell convention for a user-interrupted process.
 */

import { isCancel, cancel } from "@clack/prompts";

/**
 * Prints the clack cancel notice and terminates the process with exit code
 * 130 (128 + SIGINT). The standard cancel path for every interactive prompt
 * flow in vex — call this instead of open-coding `cancel()` + `process.exit()`.
 *
 * @param message - Notice shown above the exit; defaults to `"Cancelled."`.
 */
export function cancelAndExit(message = "Cancelled."): never {
  cancel(message);
  process.exit(130);
}

/**
 * Returns `value` unwrapped, or calls {@link cancelAndExit} when `value` is a
 * clack cancel symbol (the user pressed Ctrl+C / Esc during a prompt).
 *
 * @param value - The raw result of a clack prompt call (`text`, `select`, `confirm`, …).
 * @param message - Cancel notice forwarded to {@link cancelAndExit}.
 */
export function unwrapCancel<T>(value: T | symbol, message?: string): T {
  if (isCancel(value)) {
    cancelAndExit(message);
  }
  return value;
}

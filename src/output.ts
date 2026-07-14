import { VexError } from "./errors.js";

/**
 * When set to "1", MCP responses are pretty-printed with 2-space indent.
 * Default is compact (no indent) to save tokens — typical MCP sessions burn
 * ~25–30% of every response on whitespace otherwise.
 */
const PRETTY_MCP = process.env.VEX_PRETTY_JSON === "1";

/** Serializes `data` to JSON, honoring {@link PRETTY_MCP} for indentation. */
function mcpStringify(data: unknown): string {
  return PRETTY_MCP ? JSON.stringify(data, null, 2) : JSON.stringify(data);
}

/**
 * Formats data as a JSON MCP text content response.
 *
 * Used by MCP tool handlers to return structured JSON to the client. Compact
 * by default; set the `VEX_PRETTY_JSON=1` environment variable when launching
 * the MCP server to switch to pretty-printed output (useful for debugging
 * but ~30% more tokens per response).
 *
 * @param data - The data to serialize.
 * @returns An MCP-compatible content array with a single JSON text block.
 */
export function jsonContent(data: unknown) {
  return { content: [{ type: "text" as const, text: mcpStringify(data) }] };
}

/**
 * Prints data as pretty-printed JSON to stdout.
 *
 * @param data - The data to serialize and print.
 */
export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Prints a success message to stdout with an "OK" prefix.
 *
 * @param message - The success message to display.
 */
export function printSuccess(message: string): void {
  console.log(`OK  ${message}`);
}

/**
 * Prints an error message to stderr with an "ERR" prefix.
 *
 * @param message - The error message to display.
 */
export function printError(message: string): void {
  console.error(`ERR ${message}`);
}

/**
 * Prints an informational message to stdout (no prefix).
 *
 * Use for neutral output that is neither a success nor an error.
 *
 * @param message - The informational message to display.
 */
export function printInfo(message: string): void {
  console.log(message);
}

/**
 * Prints a formatted ASCII table to stdout.
 *
 * Columns are automatically sized to fit the widest value in each column.
 *
 * @param headers - Column header labels.
 * @param rows - Row data, where each inner array corresponds to a table row.
 */
export function printTable(
  headers: readonly string[],
  rows: readonly (readonly string[])[]
): void {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length))
  );

  const divider = widths.map((w) => "-".repeat(w)).join("--+-");
  const formatRow = (cells: readonly string[]) =>
    cells.map((c, i) => (c ?? "").padEnd(widths[i])).join("  | ");

  console.log(formatRow(headers));
  console.log(divider);
  for (const row of rows) {
    console.log(formatRow(row));
  }
}

/**
 * Prints an error message (and, for {@link VexError}s, the indented hint)
 * to stderr and terminates the process.
 *
 * @param err - The error to display. Extracts `.message` from Error instances.
 */
export function handleError(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  printError(message);
  if (err instanceof VexError && err.hint) {
    for (const line of err.hint.split("\n")) {
      console.error(`    ${line}`);
    }
  }
  process.exit(1);
}

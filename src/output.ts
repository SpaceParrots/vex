/**
 * Formats data as a JSON MCP text content response.
 *
 * Used by MCP tool handlers to return structured JSON to the client.
 *
 * @param data - The data to serialize.
 * @returns An MCP-compatible content array with a single JSON text block.
 */
export function jsonContent(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
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
 * Prints an error message and terminates the process.
 *
 * @param err - The error to display. Extracts `.message` from Error instances.
 */
export function handleError(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  printError(message);
  process.exit(1);
}

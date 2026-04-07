export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printSuccess(message: string): void {
  console.log(`OK  ${message}`);
}

export function printError(message: string): void {
  console.error(`ERR ${message}`);
}

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

export function handleError(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  printError(message);
  process.exit(1);
}

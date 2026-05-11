import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("vitest smoke", () => {
  it("loads the shared SDL fixture", () => {
    const sdl = readFileSync(join(__dirname, "fixtures/schema.graphql"), "utf-8");
    expect(sdl).toContain("type Customer");
    expect(sdl).toContain("interface PaginatedList");
  });
});

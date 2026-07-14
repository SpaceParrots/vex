import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/config.js", async (orig) => {
  const actual = await orig<typeof import("../src/config.js")>();
  return { ...actual, getSchemaPath: vi.fn() };
});

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getSchemaPath } from "../src/config.js";
import { enrichPermissionError } from "../src/permission-errors.js";
import { PermissionError, NetworkError } from "../src/errors.js";

const SDL = `enum Permission { CreateCatalog CreateProduct ReadProduct }`;

describe("enrichPermissionError", () => {
  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "vex-perm-test-"));
    const schemaPath = join(dir, "dev.graphql");
    writeFileSync(schemaPath, SDL);
    vi.mocked(getSchemaPath).mockReturnValue(schemaPath);
  });

  it("rewrites a PermissionError with operation name and suggestions", async () => {
    const raw = new PermissionError("HTTP 200 — denied [FORBIDDEN]");
    const enriched = await enrichPermissionError(
      raw,
      "dev",
      "mutation ($i: CreateProductInput!) { createProduct(input: $i) { id } }"
    );
    expect(enriched).toBeInstanceOf(PermissionError);
    expect(enriched).not.toBe(raw);
    expect(enriched.message).toBe('Permission denied for `createProduct` on env "dev".');
    expect((enriched as PermissionError).operationName).toBe("createProduct");
    expect((enriched as PermissionError).suggestedPermissions).toContain("CreateProduct");
    expect(enriched.hint).toContain("CreateProduct");
    expect(enriched.hint).toContain("vex schema permissions");
  });

  it("returns non-permission errors unchanged", async () => {
    const err = new NetworkError("down");
    expect(await enrichPermissionError(err, "dev", "{ x }")).toBe(err);
  });

  it("returns the original error when no schema cache exists", async () => {
    vi.mocked(getSchemaPath).mockReturnValue(join(tmpdir(), "does-not-exist.graphql"));
    const raw = new PermissionError("denied");
    expect(await enrichPermissionError(raw, "dev", "{ products { totalItems } }")).toBe(raw);
  });
});

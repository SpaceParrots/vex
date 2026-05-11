import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSchemaFromSdl, clearSchemaCache } from "../../src/schema-model/parse.js";
import {
  saveFragment,
  listFragments,
  setFragmentsRootForTests,
} from "../../src/services/fragments.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const fixture = readFileSync(join(__dirname, "../fixtures/schema.graphql"), "utf-8");

let tmp: string;

beforeEach(() => {
  clearSchemaCache();
  tmp = mkdtempSync(join(tmpdir(), "vex-frag-"));
  setFragmentsRootForTests(tmp);
});

describe("saveFragment", () => {
  it("writes a valid fragment to {envName}/{Name}.graphql", async () => {
    const schema = parseSchemaFromSdl("env1", fixture);
    const sdl = `fragment CustomerBasic on Customer { id firstName }`;
    const out = await saveFragment({ envName: "env1", name: "CustomerBasic", sdl, schema });
    expect(out.onType).toBe("Customer");
    expect(existsSync(join(tmp, "env1", "CustomerBasic.graphql"))).toBe(true);
  });

  it("rejects names that do not match the identifier regex", async () => {
    const schema = parseSchemaFromSdl("env1", fixture);
    const sdl = `fragment X on Customer { id }`;
    await expect(
      saveFragment({ envName: "env1", name: "1bad", sdl, schema })
    ).rejects.toThrow(/must match/i);
    await expect(
      saveFragment({ envName: "env1", name: "bad-name", sdl, schema })
    ).rejects.toThrow(/must match/i);
    await expect(
      saveFragment({ envName: "env1", name: "", sdl, schema })
    ).rejects.toThrow(/must match/i);
  });

  it("rejects when the name does not match the fragment definition", async () => {
    const schema = parseSchemaFromSdl("env1", fixture);
    const sdl = `fragment CustomerBasic on Customer { id }`;
    await expect(
      saveFragment({ envName: "env1", name: "NotMatching", sdl, schema })
    ).rejects.toThrow(/name/i);
  });

  it("rejects when a referenced field is not in the schema", async () => {
    const schema = parseSchemaFromSdl("env1", fixture);
    const sdl = `fragment X on Customer { id nonExistentField }`;
    await expect(
      saveFragment({ envName: "env1", name: "X", sdl, schema })
    ).rejects.toThrow(/nonExistentField/);
  });

  it("refuses overwrite by default; allows with overwrite: true", async () => {
    const schema = parseSchemaFromSdl("env1", fixture);
    const sdl = `fragment Y on Customer { id }`;
    await saveFragment({ envName: "env1", name: "Y", sdl, schema });
    await expect(
      saveFragment({ envName: "env1", name: "Y", sdl, schema })
    ).rejects.toThrow(/exists/i);
    await expect(
      saveFragment({ envName: "env1", name: "Y", sdl, schema, overwrite: true })
    ).resolves.toMatchObject({ name: "Y" });
  });
});

describe("listFragments", () => {
  it("returns an empty array when no fragments exist", async () => {
    expect(await listFragments({ envName: "envEmpty" })).toEqual([]);
  });

  it("returns metadata for stored fragments and filters by onType", async () => {
    const schema = parseSchemaFromSdl("env2", fixture);
    await saveFragment({
      envName: "env2",
      name: "CustomerBasic",
      sdl: `fragment CustomerBasic on Customer { id }`,
      schema,
    });
    await saveFragment({
      envName: "env2",
      name: "OrderBasic",
      sdl: `fragment OrderBasic on Order { id code }`,
      schema,
    });
    const all = await listFragments({ envName: "env2" });
    expect(all.map((f) => f.name).sort()).toEqual(["CustomerBasic", "OrderBasic"]);
    const onlyCust = await listFragments({ envName: "env2", onType: "Customer" });
    expect(onlyCust.map((f) => f.name)).toEqual(["CustomerBasic"]);
  });
});

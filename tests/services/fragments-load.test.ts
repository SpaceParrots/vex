import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSchemaFromSdl, clearSchemaCache } from "../../src/schema-model/parse.js";
import {
  saveFragment,
  loadFragment,
  setFragmentsRootForTests,
  clearFragmentCache,
} from "../../src/services/fragments.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(__dirname, "../fixtures/schema.graphql"), "utf-8");

let tmp: string;

beforeEach(() => {
  clearSchemaCache();
  tmp = mkdtempSync(join(tmpdir(), "vex-frag-load-"));
  setFragmentsRootForTests(tmp);
  clearFragmentCache();
});

describe("loadFragment", () => {
  it("loads a fragment as a Selection tree", async () => {
    const schema = parseSchemaFromSdl("e", fixture);
    await saveFragment({
      envName: "e",
      name: "CustomerBasic",
      sdl: `fragment CustomerBasic on Customer { id firstName }`,
      schema,
    });
    const sel = await loadFragment({ envName: "e", name: "CustomerBasic", schema });
    expect(sel.kind).toBe("object");
    if (sel.kind !== "object") return;
    expect(Object.keys(sel.fields).sort()).toEqual(["firstName", "id"]);
  });

  it("inlines referenced fragments", async () => {
    const schema = parseSchemaFromSdl("e", fixture);
    await saveFragment({
      envName: "e",
      name: "AddressFull",
      sdl: `fragment AddressFull on Address { id streetLine1 city }`,
      schema,
    });
    await saveFragment({
      envName: "e",
      name: "CustomerWithAddresses",
      sdl: `fragment CustomerWithAddresses on Customer { id addresses { ...AddressFull } }`,
      schema,
    });
    const sel = await loadFragment({ envName: "e", name: "CustomerWithAddresses", schema });
    expect(sel.kind).toBe("object");
    if (sel.kind !== "object") return;
    const addresses = sel.fields.addresses;
    expect(addresses?.kind).toBe("object");
    if (addresses?.kind !== "object") return;
    expect(Object.keys(addresses.fields).sort()).toEqual(["city", "id", "streetLine1"]);
  });

  it("detects cycles", async () => {
    const schema = parseSchemaFromSdl("e", fixture);
    // graphql.parse rejects circular fragment spreads in a single doc, so write the
    // files directly to bypass save-time validation.
    const fs = await import("node:fs/promises");
    const { mkdir, writeFile } = fs;
    await mkdir(join(tmp, "e"), { recursive: true });
    await writeFile(
      join(tmp, "e", "A.graphql"),
      `fragment A on Customer { id ...B }`,
      "utf-8"
    );
    await writeFile(
      join(tmp, "e", "B.graphql"),
      `fragment B on Customer { firstName ...A }`,
      "utf-8"
    );
    await expect(loadFragment({ envName: "e", name: "A", schema })).rejects.toThrow(/cycle/i);
  });

  it("throws with the missing fragment's name when a spread references nothing", async () => {
    const schema = parseSchemaFromSdl("e", fixture);
    const fs = await import("node:fs/promises");
    const { mkdir, writeFile } = fs;
    await mkdir(join(tmp, "e"), { recursive: true });
    await writeFile(
      join(tmp, "e", "Lonely.graphql"),
      `fragment Lonely on Customer { id ...Missing }`,
      "utf-8"
    );
    await expect(loadFragment({ envName: "e", name: "Lonely", schema })).rejects.toThrow(/Missing/);
  });
});

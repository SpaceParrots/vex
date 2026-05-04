import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSchemaFromSdl, clearSchemaCache } from "../../src/schema-model/parse.js";
import {
  saveFragment,
  deleteFragment,
  getFragmentSdl,
  setFragmentsRootForTests,
  clearFragmentCache,
} from "../../src/services/fragments.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(__dirname, "../fixtures/schema.graphql"), "utf-8");

let tmp: string;

beforeEach(() => {
  clearSchemaCache();
  tmp = mkdtempSync(join(tmpdir(), "vex-frag-del-"));
  setFragmentsRootForTests(tmp);
  clearFragmentCache();
});

describe("deleteFragment", () => {
  it("removes the file and reports success", async () => {
    const schema = parseSchemaFromSdl("e", fixture);
    await saveFragment({
      envName: "e",
      name: "Z",
      sdl: `fragment Z on Customer { id }`,
      schema,
    });
    expect(existsSync(join(tmp, "e", "Z.graphql"))).toBe(true);
    expect(await deleteFragment({ envName: "e", name: "Z" })).toEqual({ deleted: true });
    expect(existsSync(join(tmp, "e", "Z.graphql"))).toBe(false);
  });

  it("returns deleted: false when the fragment does not exist", async () => {
    expect(await deleteFragment({ envName: "e", name: "Nope" })).toEqual({
      deleted: false,
      reason: "not found",
    });
  });
});

describe("getFragmentSdl", () => {
  it("returns the raw SDL of an existing fragment", async () => {
    const schema = parseSchemaFromSdl("e", fixture);
    const sdl = `fragment Q on Customer { id }`;
    await saveFragment({ envName: "e", name: "Q", sdl, schema });
    expect(await getFragmentSdl({ envName: "e", name: "Q" })).toBe(sdl);
  });

  it("throws when the fragment does not exist", async () => {
    await expect(getFragmentSdl({ envName: "e", name: "Nope" })).rejects.toThrow(/not found/);
  });
});

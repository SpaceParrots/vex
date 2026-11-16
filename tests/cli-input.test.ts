import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import {
  isInlineDocument,
  isInlineJson,
  parseVariablesJson,
  readDocumentArg,
  readStdin,
  readVariablesArg,
  resolveOperationInput,
} from "../src/cli-input.js";
import { InputError } from "../src/errors.js";

const noStdin = {
  readStdin: async (): Promise<string> => {
    throw new Error("stdin must not be read");
  },
};
const stdinWith = (text: string) => ({ readStdin: async () => text });

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "vex-cli-input-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("detection", () => {
  it.each([
    ["{ __typename }", true],
    ["query Q { a }", true],
    ["mutation M($b: String!) {\n x(b: $b)\n}", true],
    ["orders.graphql", false],
    ["C:\\work\\m.graphql", false],
  ])("isInlineDocument(%j) is %s", (value, expected) => {
    expect(isInlineDocument(value)).toBe(expected);
  });

  it.each([
    ['{"a":1}', true],
    ['  \n{"a":1}', true],
    ["[1]", true],
    ["vars.json", false],
    ["./{weird}/vars.json", false],
  ])("isInlineJson(%j) is %s", (value, expected) => {
    expect(isInlineJson(value)).toBe(expected);
  });
});

describe("readDocumentArg", () => {
  it("returns inline GraphQL unchanged", async () => {
    expect(await readDocumentArg("{ __typename }", noStdin)).toBe("{ __typename }");
  });

  it("reads a path as UTF-8 and drops a BOM", async () => {
    const path = join(dir, "doc.graphql");
    await writeFile(path, "\uFEFFquery { x(s: \"Grüße\u00A0Köln\") }", "utf8");
    expect(await readDocumentArg(path, noStdin)).toBe("query { x(s: \"Grüße\u00A0Köln\") }");
  });

  it("reads stdin for -", async () => {
    expect(await readDocumentArg("-", stdinWith("query { x }"))).toBe("query { x }");
  });

  it("explains why a missing file was read as a path", async () => {
    try {
      await readDocumentArg("nope.graphql", noStdin);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(InputError);
      expect((err as InputError).message).toMatch(/nope\.graphql: no such file/);
      expect((err as InputError).hint).toMatch(/contains no "\{"/);
    }
  });

  it("rejects an empty document", async () => {
    await expect(readDocumentArg("-", stdinWith("  \n"))).rejects.toThrow(/empty/);
  });
});

describe("readVariablesArg", () => {
  it("parses inline JSON", async () => {
    expect(await readVariablesArg('{"id":"1"}', "--variables", noStdin)).toEqual({ id: "1" });
  });

  it("reads a JSON file with BOM", async () => {
    const path = join(dir, "bom.json");
    await writeFile(path, '\uFEFF{"a":1}', "utf8");
    expect(await readVariablesArg(path, "--variables", noStdin)).toEqual({ a: 1 });
  });

  it("reads stdin for -", async () => {
    expect(await readVariablesArg("-", "--variables", stdinWith('{"y":2}'))).toEqual({ y: 2 });
  });

  it("suggests a file when inline JSON does not parse", async () => {
    await expect(readVariablesArg("{nope", "--variables", noStdin)).rejects.toMatchObject({ hint: expect.stringMatching(/file/) });
  });

  it("does not suggest a file when the file itself holds invalid JSON", async () => {
    const path = join(dir, "broken.json");
    await writeFile(path, "{nope", "utf8");
    await expect(readVariablesArg(path, "--variables", noStdin)).rejects.toMatchObject({ hint: undefined });
  });

  it("explains why a missing file was read as a path", async () => {
    await expect(readVariablesArg("vars.json", "--variables", noStdin)).rejects.toThrow(/vars\.json: no such file/);
  });
});

describe("readStdin", () => {
  it("joins UTF-8 chunks split inside a multi-byte character", async () => {
    const bytes = Buffer.from("ä", "utf8");
    const stream = Readable.from([bytes.subarray(0, 1), bytes.subarray(1)]);
    expect(await readStdin(stream)).toBe("ä");
  });
});

describe("parseVariablesJson", () => {
  it("rejects invalid JSON as an InputError", () => {
    expect(() => parseVariablesJson("{nope", "vars")).toThrow(InputError);
  });

  it.each(["[]", "null", "42", '"x"'])("rejects non-object JSON %s", (text) => {
    expect(() => parseVariablesJson(text, "vars")).toThrow(/must be a JSON object/);
  });
});

describe("resolveOperationInput", () => {
  it("passes inline document and variables through", async () => {
    const result = await resolveOperationInput({ document: "{ a }", variables: '{"x":1}' }, noStdin);
    expect(result).toEqual({ document: "{ a }", variables: { x: 1 } });
  });

  it("leaves variables undefined when none are given", async () => {
    expect(await resolveOperationInput({ document: "{ a }" }, noStdin)).toEqual({ document: "{ a }" });
  });

  it("reads a document and a large variables file", async () => {
    const docPath = join(dir, "m.graphql");
    const varsPath = join(dir, "vars.json");
    const body = "ü".repeat(12_000);
    await writeFile(docPath, "mutation M($b: String!) { x(b: $b) }", "utf8");
    await writeFile(varsPath, JSON.stringify({ b: body }), "utf8");
    const result = await resolveOperationInput({ document: docPath, variables: varsPath }, noStdin);
    expect(result.document).toBe("mutation M($b: String!) { x(b: $b) }");
    expect(result.variables).toEqual({ b: body });
  });

  it("rejects two arguments from stdin", async () => {
    await expect(resolveOperationInput({ document: "-", variables: "-" }, noStdin)).rejects.toThrow(/Only one/);
  });
});

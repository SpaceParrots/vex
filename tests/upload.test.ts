import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contentTypeFor, setValueAtPath, buildUploadForm, requestWithUploads } from "../src/upload.js";
import { GraphQLRequestError, VexError } from "../src/errors.js";

describe("contentTypeFor", () => {
  it("maps known extensions and falls back to octet-stream", () => {
    expect(contentTypeFor("a/logo.PNG")).toBe("image/png");
    expect(contentTypeFor("b/photo.jpeg")).toBe("image/jpeg");
    expect(contentTypeFor("c/file.unknownext")).toBe("application/octet-stream");
  });
});

describe("setValueAtPath", () => {
  it("sets a nested object value immutably", () => {
    const original = { input: { name: "x" } };
    const result = setValueAtPath(original, "input.file", null) as { input: { name: string; file: null } };
    expect(result.input.file).toBeNull();
    expect(result.input.name).toBe("x");
    expect(original).toEqual({ input: { name: "x" } }); // untouched
  });

  it("creates arrays for numeric segments", () => {
    const result = setValueAtPath({}, "input.0.file", null) as { input: Array<{ file: null }> };
    expect(Array.isArray(result.input)).toBe(true);
    expect(result.input[0].file).toBeNull();
  });
});

describe("buildUploadForm", () => {
  const dir = mkdtempSync(join(tmpdir(), "vex-upload-test-"));
  const filePath = join(dir, "logo.png");
  beforeAll(() => writeFileSync(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47])));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("builds operations, map, and file parts per the multipart spec", async () => {
    const doc = "mutation ($input: [CreateAssetInput!]!) { createAssets(input: $input) { __typename } }";
    const form = await buildUploadForm(doc, { input: [{ file: null }] }, { "input.0.file": filePath });

    const operations = JSON.parse(form.get("operations") as string);
    expect(operations.query).toBe(doc);
    expect(operations.variables).toEqual({ input: [{ file: null }] });

    expect(JSON.parse(form.get("map") as string)).toEqual({ "0": ["variables.input.0.file"] });

    const filePart = form.get("0") as File;
    expect(filePart.name).toBe("logo.png");
    expect(filePart.type).toBe("image/png");
    expect(filePart.size).toBe(4);
  });
});

describe("requestWithUploads", () => {
  const dir = mkdtempSync(join(tmpdir(), "vex-upload-req-test-"));
  const filePath = join(dir, "a.png");
  const ENV = { url: "https://x.example.com/admin-api", apiKey: "k" };
  beforeAll(() => writeFileSync(filePath, Buffer.from([1])));
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("posts multipart with the API key header and returns data", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { createAssets: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const data = await requestWithUploads(ENV, "mutation { x }", {}, { "input.0.file": filePath });
    expect(data).toEqual({ createAssets: [] });
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe(ENV.url);
    expect((init?.headers as Record<string, string>)["vendure-api-key"]).toBe("k");
    expect(init?.body).toBeInstanceOf(FormData);
  });

  it("throws a typed error for GraphQL errors in the response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ message: "denied", extensions: { code: "FORBIDDEN" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    await expect(
      requestWithUploads(ENV, "mutation { x }", {}, { "input.0.file": filePath })
    ).rejects.toBeInstanceOf(GraphQLRequestError);
  });

  it("throws a VexError before any request when a file is missing", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    await expect(
      requestWithUploads(ENV, "mutation { x }", {}, { "input.0.file": join(dir, "missing.bin") })
    ).rejects.toBeInstanceOf(VexError);
    expect(spy).not.toHaveBeenCalled();
  });
});

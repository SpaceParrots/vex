import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/upload.js", async (orig) => {
  const actual = await orig<typeof import("../../src/upload.js")>();
  return { ...actual, requestWithUploads: vi.fn() };
});
vi.mock("../../src/context.js", async (orig) => {
  const actual = await orig<typeof import("../../src/context.js")>();
  return { ...actual, getCurrentEnv: vi.fn() };
});
vi.mock("../../src/client.js", async (orig) => {
  const actual = await orig<typeof import("../../src/client.js")>();
  return { ...actual, getClient: vi.fn() };
});

import { requestWithUploads } from "../../src/upload.js";
import { getCurrentEnv } from "../../src/context.js";
import { getClient } from "../../src/client.js";
import { uploadAssets, deleteAsset } from "../../src/services/assets.js";
import { VexError } from "../../src/errors.js";

const CTX = {
  name: "dev",
  env: { url: "https://dev.example.com/admin-api", apiKey: "k" },
  source: "active" as const,
};

describe("uploadAssets", () => {
  beforeEach(() => {
    vi.mocked(getCurrentEnv).mockResolvedValue(CTX);
    vi.mocked(requestWithUploads).mockResolvedValue({ createAssets: [{ id: "1" }] });
  });

  it("maps each file to input.N.file and forwards tags", async () => {
    const result = await uploadAssets({ filePaths: ["./a.png", "./b.jpg"], tags: ["hero"] });
    expect(result).toEqual([{ id: "1" }]);
    const [env, doc, variables, files, envName] = vi.mocked(requestWithUploads).mock.calls[0];
    expect(env).toBe(CTX.env);
    expect(doc).toContain("createAssets");
    expect(variables).toEqual({
      input: [
        { file: null, tags: ["hero"] },
        { file: null, tags: ["hero"] },
      ],
    });
    expect(files).toEqual({ "input.0.file": "./a.png", "input.1.file": "./b.jpg" });
    expect(envName).toBe("dev");
  });
});

describe("deleteAsset", () => {
  beforeEach(() => {
    vi.mocked(getClient).mockReset();
  });

  it("rejects with the server's message when result is NOT_DELETED", async () => {
    vi.mocked(getClient).mockResolvedValue({
      request: vi.fn().mockResolvedValue({
        deleteAsset: { result: "NOT_DELETED", message: "Asset is still in use by 2 products" },
      }),
    } as never);
    await expect(deleteAsset("42")).rejects.toBeInstanceOf(VexError);
    await expect(deleteAsset("42")).rejects.toThrow(/still in use by 2 products/);
  });

  it("resolves normally when result is DELETED", async () => {
    vi.mocked(getClient).mockResolvedValue({
      request: vi.fn().mockResolvedValue({
        deleteAsset: { result: "DELETED", message: "" },
      }),
    } as never);
    const result = await deleteAsset("42");
    expect(result).toEqual({ deleteAsset: { result: "DELETED", message: "" } });
  });
});

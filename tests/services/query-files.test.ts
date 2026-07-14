import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/upload.js", async (orig) => {
  const actual = await orig<typeof import("../../src/upload.js")>();
  return { ...actual, requestWithUploads: vi.fn() };
});
vi.mock("../../src/context.js", async (orig) => {
  const actual = await orig<typeof import("../../src/context.js")>();
  return { ...actual, getCurrentEnv: vi.fn() };
});

import { requestWithUploads } from "../../src/upload.js";
import { getCurrentEnv } from "../../src/context.js";
import { executeMutationWithFiles } from "../../src/services/query.js";

describe("executeMutationWithFiles", () => {
  beforeEach(() => {
    vi.mocked(getCurrentEnv).mockResolvedValue({
      name: "dev",
      env: { url: "https://dev.example.com/admin-api", apiKey: "k" },
      source: "active",
    });
    vi.mocked(requestWithUploads).mockResolvedValue({ ok: true });
  });

  it("resolves the current env and forwards document, variables, and files", async () => {
    const files = { "input.file": "./x.png" };
    const result = await executeMutationWithFiles("mutation { x }", { a: 1 }, files);
    expect(result).toEqual({ ok: true });
    expect(vi.mocked(requestWithUploads)).toHaveBeenCalledWith(
      { url: "https://dev.example.com/admin-api", apiKey: "k" },
      "mutation { x }",
      { a: 1 },
      files,
      "dev"
    );
  });
});

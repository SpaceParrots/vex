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
import { uploadAssets } from "../../src/services/assets.js";

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

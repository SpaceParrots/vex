import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/config.js", async (orig) => {
  const actual = await orig<typeof import("../src/config.js")>();
  return { ...actual, loadConfig: vi.fn() };
});

import { loadConfig } from "../src/config.js";
import { resolveEnv } from "../src/env-context.js";

const mockedLoadConfig = vi.mocked(loadConfig);

const CONFIG = {
  activeEnvironment: "dev",
  environments: {
    dev: { url: "https://dev.example.com/admin-api", apiKey: "k-dev" },
    staging: { url: "https://staging.example.com/admin-api", apiKey: "k-stg" },
  },
};

describe("resolveEnv", () => {
  beforeEach(() => {
    mockedLoadConfig.mockResolvedValue(structuredClone(CONFIG));
    delete process.env.VEX_ENV;
  });
  afterEach(() => {
    delete process.env.VEX_ENV;
    vi.clearAllMocks();
  });

  it("uses the explicit override first (source 'param')", async () => {
    process.env.VEX_ENV = "staging";
    const r = await resolveEnv("dev");
    expect(r.name).toBe("dev");
    expect(r.source).toBe("param");
    expect(r.env.url).toBe("https://dev.example.com/admin-api");
  });

  it("falls back to VEX_ENV when no override (source 'VEX_ENV')", async () => {
    process.env.VEX_ENV = "staging";
    const r = await resolveEnv();
    expect(r.name).toBe("staging");
    expect(r.source).toBe("VEX_ENV");
  });

  it("falls back to active when no override and no VEX_ENV (source 'active')", async () => {
    const r = await resolveEnv();
    expect(r.name).toBe("dev");
    expect(r.source).toBe("active");
  });

  it("throws listing available envs when the name does not exist", async () => {
    await expect(resolveEnv("nope")).rejects.toThrow(/not found.*dev.*staging/s);
  });

  it("throws when nothing resolves", async () => {
    mockedLoadConfig.mockResolvedValue({ activeEnvironment: "", environments: {} });
    await expect(resolveEnv()).rejects.toThrow(/No environment/);
  });

  it("rejects path-unsafe names", async () => {
    await expect(resolveEnv("../evil")).rejects.toThrow(/must match/);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/context.js", async (orig) => {
  const actual = await orig<typeof import("../../src/context.js")>();
  return { ...actual, getCurrentEnv: vi.fn() };
});

vi.mock("../../src/config.js", async (orig) => {
  const actual = await orig<typeof import("../../src/config.js")>();
  return {
    ...actual,
    linkProject: vi.fn(async () => ({})),
    unlinkProject: vi.fn(async () => ({})),
  };
});

import { noEnvironmentMessage, linkProject, unlinkProject } from "../../src/config.js";
import { getCurrentEnv, NoEnvironmentError } from "../../src/context.js";
import { currentEnvLine } from "../../src/services/env.js";

const mockedGetCurrentEnv = vi.mocked(getCurrentEnv);

describe("currentEnvLine", () => {
  beforeEach(() => vi.clearAllMocks());

  it("formats a VEX_ENV resolution with host and reason", async () => {
    mockedGetCurrentEnv.mockResolvedValue({
      name: "staging",
      env: { url: "https://staging.example.com/admin-api", apiKey: "x" },
      source: "VEX_ENV",
    });
    expect(await currentEnvLine()).toBe(
      "staging → staging.example.com (via VEX_ENV)"
    );
  });

  it("formats an active resolution", async () => {
    mockedGetCurrentEnv.mockResolvedValue({
      name: "dev",
      env: { url: "https://dev.example.com/admin-api", apiKey: "x" },
      source: "active",
    });
    expect(await currentEnvLine()).toBe("dev → dev.example.com (via active)");
  });

  it("returns 'none configured' when resolution throws NoEnvironmentError", async () => {
    mockedGetCurrentEnv.mockRejectedValue(new NoEnvironmentError("No environment configured."));
    expect(await currentEnvLine()).toBe("none configured");
  });

  it("returns the error message when resolution throws a non-NoEnvironmentError", async () => {
    mockedGetCurrentEnv.mockRejectedValue(
      new Error('Environment "bad" not found (selected via param). Available: dev.')
    );
    expect(await currentEnvLine()).toBe(
      'Environment "bad" not found (selected via param). Available: dev.'
    );
  });

  it("formats a param resolution with host and reason", async () => {
    mockedGetCurrentEnv.mockResolvedValue({
      name: "staging",
      env: { url: "https://staging.example.com/admin-api", apiKey: "x" },
      source: "param",
    });
    expect(await currentEnvLine()).toBe(
      "staging → staging.example.com (via env param)"
    );
  });
});

describe("noEnvironmentMessage", () => {
  it("returns the 'no environments configured' string when the map is empty", () => {
    expect(noEnvironmentMessage({})).toBe(
      "No environments configured. Add one with `vex env add` (or the vex_setup tool)."
    );
  });

  it("returns the 'no environment selected' string listing available names when the map is non-empty", () => {
    const envs = {
      a: { url: "https://a.example.com/admin-api", apiKey: "k-a" },
      b: { url: "https://b.example.com/admin-api", apiKey: "k-b" },
    };
    expect(noEnvironmentMessage(envs)).toBe(
      "No environment selected. Pass an explicit env name or run `vex env switch <name>` to set one active. Available: a, b."
    );
  });
});

describe("project link service wrappers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("linkProjectPath defaults the path to cwd and delegates to config", async () => {
    const { linkProjectPath } = await import("../../src/services/env.js");
    const result = await linkProjectPath({ envName: "dev" });
    expect(result.envName).toBe("dev");
    expect(result.path).toBe(process.cwd());
    expect(vi.mocked(linkProject)).toHaveBeenCalledWith(process.cwd(), "dev");
  });

  it("unlinkProjectPath defaults the path to cwd", async () => {
    const { unlinkProjectPath } = await import("../../src/services/env.js");
    const result = await unlinkProjectPath();
    expect(result.path).toBe(process.cwd());
    expect(vi.mocked(unlinkProject)).toHaveBeenCalledWith(process.cwd());
  });
});

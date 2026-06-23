import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/env-context.js", async (orig) => {
  const actual = await orig<typeof import("../../src/env-context.js")>();
  return { ...actual, getCurrentEnv: vi.fn() };
});

import { getCurrentEnv, NoEnvironmentError } from "../../src/env-context.js";
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

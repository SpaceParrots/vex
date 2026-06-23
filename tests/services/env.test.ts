import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/env-context.js", () => ({
  resolveEnv: vi.fn(),
}));

import { resolveEnv } from "../../src/env-context.js";
import { currentEnvLine } from "../../src/services/env.js";

const mockedResolveEnv = vi.mocked(resolveEnv);

describe("currentEnvLine", () => {
  beforeEach(() => vi.clearAllMocks());

  it("formats a VEX_ENV resolution with host and reason", async () => {
    mockedResolveEnv.mockResolvedValue({
      name: "staging",
      env: { url: "https://staging.example.com/admin-api", apiKey: "x" },
      source: "VEX_ENV",
    });
    expect(await currentEnvLine()).toBe(
      "staging → staging.example.com (via VEX_ENV)"
    );
  });

  it("formats an active resolution", async () => {
    mockedResolveEnv.mockResolvedValue({
      name: "dev",
      env: { url: "https://dev.example.com/admin-api", apiKey: "x" },
      source: "active",
    });
    expect(await currentEnvLine()).toBe("dev → dev.example.com (via active)");
  });

  it("returns 'none configured' when resolution throws", async () => {
    mockedResolveEnv.mockRejectedValue(new Error("No environment configured."));
    expect(await currentEnvLine()).toBe("none configured");
  });
});

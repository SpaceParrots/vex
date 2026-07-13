import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/context.js", async (orig) => {
  const actual = await orig<typeof import("../../src/context.js")>();
  return { ...actual, getCurrentEnv: vi.fn() };
});
vi.mock("../../src/services/env.js", async (orig) => {
  const actual = await orig<typeof import("../../src/services/env.js")>();
  return { ...actual, checkEndpoint: vi.fn() };
});
vi.mock("../../src/config.js", async (orig) => {
  const actual = await orig<typeof import("../../src/config.js")>();
  return { ...actual, getSchemaPath: vi.fn() };
});

import { getCurrentEnv } from "../../src/context.js";
import { checkEndpoint } from "../../src/services/env.js";
import { getSchemaPath } from "../../src/config.js";
import { statusReport } from "../../src/services/status.js";

describe("statusReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentEnv).mockResolvedValue({
      name: "dev",
      env: { url: "https://dev.example.com/admin-api", apiKey: "k-dev-1234" },
      source: "project",
      projectPath: "/repos/shop",
    });
    vi.mocked(checkEndpoint).mockResolvedValue({ ok: true, detail: "reachable, API key accepted" });
    vi.mocked(getSchemaPath).mockReturnValue("/nonexistent/path/schema.graphql");
  });

  it("aggregates env, endpoint, schema, and config info", async () => {
    const report = await statusReport();
    expect(report.envName).toBe("dev");
    expect(report.source).toBe("project");
    expect(report.projectPath).toBe("/repos/shop");
    expect(report.apiKeyMasked).toBe("k-de****");
    expect(report.endpoint.ok).toBe(true);
    expect(report.endpoint.latencyMs).toBeGreaterThanOrEqual(0);
    expect(report.schema.detail.length).toBeGreaterThan(0);
    expect(report.configPath.length).toBeGreaterThan(0);
    expect(report.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});

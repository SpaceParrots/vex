import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/config.js", async (orig) => {
  const actual = await orig<typeof import("../src/config.js")>();
  return { ...actual, loadConfig: vi.fn() };
});

import { loadConfig } from "../src/config.js";
import { resolveEnv, withEnv, findProjectLink } from "../src/context.js";
import { getClient } from "../src/client.js";

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

describe("getClient honors the ambient override", () => {
  beforeEach(() => {
    mockedLoadConfig.mockResolvedValue(structuredClone(CONFIG));
    delete process.env.VEX_ENV;
  });

  it("sends the request to the override env's URL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { __typename: "Query" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const client = await withEnv("staging", () => getClient());
    await client.request("{ __typename }");

    const [calledUrl] = fetchSpy.mock.calls[0];
    expect(String(calledUrl)).toBe("https://staging.example.com/admin-api");
  });
});

describe("project-link resolution", () => {
  const PROJECT_CONFIG = {
    activeEnvironment: "dev",
    environments: {
      dev: { url: "https://dev.example.com/admin-api", apiKey: "k-dev" },
      shop: { url: "https://shop.example.com/admin-api", apiKey: "k-shop" },
      inner: { url: "https://inner.example.com/admin-api", apiKey: "k-inner" },
    },
    projects: {
      "/repos/shop": "shop",
      "/repos/shop/packages/plugin": "inner",
    },
  };

  beforeEach(() => {
    mockedLoadConfig.mockResolvedValue(structuredClone(PROJECT_CONFIG));
    delete process.env.VEX_ENV;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.VEX_ENV;
  });

  it("resolves the linked env when cwd is inside a linked repo (source 'project')", async () => {
    vi.spyOn(process, "cwd").mockReturnValue("/repos/shop/src/plugins");
    const r = await resolveEnv();
    expect(r.name).toBe("shop");
    expect(r.source).toBe("project");
    expect(r.projectPath).toBe("/repos/shop");
  });

  it("the deepest (longest) link wins", async () => {
    vi.spyOn(process, "cwd").mockReturnValue("/repos/shop/packages/plugin/src");
    const r = await resolveEnv();
    expect(r.name).toBe("inner");
  });

  it("VEX_ENV beats the project link", async () => {
    vi.spyOn(process, "cwd").mockReturnValue("/repos/shop");
    process.env.VEX_ENV = "dev";
    const r = await resolveEnv();
    expect(r.source).toBe("VEX_ENV");
  });

  it("falls back to active when cwd is outside every linked repo", async () => {
    vi.spyOn(process, "cwd").mockReturnValue("/elsewhere");
    const r = await resolveEnv();
    expect(r.name).toBe("dev");
    expect(r.source).toBe("active");
  });
});

describe("findProjectLink", () => {
  it("returns undefined when there are no projects", () => {
    expect(findProjectLink(undefined, "/anywhere")).toBeUndefined();
  });
  it("matches the exact directory", () => {
    expect(findProjectLink({ "/repos/shop": "shop" }, "/repos/shop")).toEqual({
      path: "/repos/shop",
      envName: "shop",
    });
  });
});

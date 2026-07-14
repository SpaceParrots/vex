import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/config.js", async (orig) => {
  const actual = await orig<typeof import("../src/config.js")>();
  return { ...actual, loadConfig: vi.fn() };
});

vi.mock("../src/schema.js", async (orig) => {
  const actual = await orig<typeof import("../src/schema.js")>();
  return { ...actual, loadSchema: vi.fn() };
});

import { loadConfig } from "../src/config.js";
import { loadSchema } from "../src/schema.js";
import { registerCurrentSchemaResource, type SchemaResourceHost } from "../src/mcp.js";

const mockedLoadConfig = vi.mocked(loadConfig);
const mockedLoadSchema = vi.mocked(loadSchema);

const CONFIG = {
  activeEnvironment: "prod",
  environments: {
    prod: { url: "https://prod.example.com/admin-api", apiKey: "k-prod" },
    staging: { url: "https://staging.example.com/admin-api", apiKey: "k-stg" },
  },
};

/** Captures what a real McpServer would have had registered on it. */
function recordingHost(): {
  host: SchemaResourceHost;
  registered: { name: string; uri: string; read: () => Promise<string> }[];
} {
  const registered: { name: string; uri: string; read: () => Promise<string> }[] = [];
  const host: SchemaResourceHost = {
    resource: (name, uri, _metadata, handler) => {
      registered.push({
        name,
        uri,
        read: async () => (await handler()).contents[0].text,
      });
    },
  };
  return { host, registered };
}

beforeEach(() => {
  mockedLoadConfig.mockResolvedValue(structuredClone(CONFIG));
  mockedLoadSchema.mockResolvedValue("type Query { ok: Boolean }");
  delete process.env.VEX_ENV;
});
afterEach(() => {
  delete process.env.VEX_ENV;
  vi.clearAllMocks();
});

describe("registerCurrentSchemaResource", () => {
  it("exposes the active environment's schema when nothing overrides it", async () => {
    const { host, registered } = recordingHost();
    await registerCurrentSchemaResource(host);

    expect(registered).toHaveLength(1);
    expect(registered[0].uri).toBe("vendure://schema/prod");
  });

  it("follows VEX_ENV rather than the active environment", async () => {
    // The bug this guards: `vex mcp install` pins VEX_ENV, so advertising the
    // active env's schema would ground the agent in the wrong store's types
    // while every tool call went to the pinned one.
    process.env.VEX_ENV = "staging";
    const { host, registered } = recordingHost();
    await registerCurrentSchemaResource(host);

    expect(registered).toHaveLength(1);
    expect(registered[0].uri).toBe("vendure://schema/staging");
    expect(registered[0].name).toBe("vendure-schema-staging");

    // ...and it loaded staging's schema, not prod's.
    const [, envNameArg] = mockedLoadSchema.mock.calls[0];
    expect(envNameArg).toBe("staging");
  });

  it("loads the schema for the resolved environment's config, not the active one", async () => {
    process.env.VEX_ENV = "staging";
    const { host } = recordingHost();
    await registerCurrentSchemaResource(host);

    const [envArg] = mockedLoadSchema.mock.calls[0];
    expect(envArg.url).toBe("https://staging.example.com/admin-api");
  });

  it("re-reads the schema on every request, so a refetch is picked up", async () => {
    const { host, registered } = recordingHost();
    await registerCurrentSchemaResource(host);

    expect(await registered[0].read()).toBe("type Query { ok: Boolean }");

    // Simulate vex_refetch_schema replacing the cached SDL.
    mockedLoadSchema.mockResolvedValue("type Query { ok: Boolean, added: Int }");

    expect(await registered[0].read()).toBe("type Query { ok: Boolean, added: Int }");
  });

  it("advertises nothing when the schema is not cached yet", async () => {
    mockedLoadSchema.mockRejectedValue(new Error("no schema cached"));
    const { host, registered } = recordingHost();
    await registerCurrentSchemaResource(host);

    expect(registered).toHaveLength(0);
  });

  it("advertises nothing when no environment is configured", async () => {
    mockedLoadConfig.mockResolvedValue({ activeEnvironment: "", environments: {} });
    const { host, registered } = recordingHost();
    await registerCurrentSchemaResource(host);

    expect(registered).toHaveLength(0);
  });
});

import { describe, it, expect } from "vitest";
import {
  buildVexServerEntry,
  mergeMcpJson,
  getExistingVexEntry,
} from "../../src/services/mcp-config.js";
import { ConfigError } from "../../src/errors.js";

describe("buildVexServerEntry", () => {
  it("builds a global-vex entry with VEX_ENV and VEX_TOOLS", () => {
    expect(buildVexServerEntry({ envName: "dev", tools: "lean", useNpx: false })).toEqual({
      command: "vex",
      args: ["serve"],
      env: { VEX_ENV: "dev", VEX_TOOLS: "lean" },
    });
  });

  it("builds an npx entry", () => {
    expect(buildVexServerEntry({ envName: "prod", tools: "full", useNpx: true })).toEqual({
      command: "npx",
      args: ["-y", "@spaceparrots/vex", "serve"],
      env: { VEX_ENV: "prod", VEX_TOOLS: "full" },
    });
  });
});

describe("mergeMcpJson", () => {
  const entry = buildVexServerEntry({ envName: "dev", tools: "lean", useNpx: false });

  it("creates a fresh file when none exists", () => {
    const out = mergeMcpJson(undefined, entry);
    expect(JSON.parse(out)).toEqual({ mcpServers: { vex: entry } });
    expect(out.endsWith("\n")).toBe(true);
  });

  it("preserves other servers and unknown root keys", () => {
    const existing = JSON.stringify({
      $schema: "https://example.com/mcp.schema.json",
      mcpServers: { other: { command: "other-tool", args: [] } },
    });
    const parsed = JSON.parse(mergeMcpJson(existing, entry));
    expect(parsed.$schema).toBe("https://example.com/mcp.schema.json");
    expect(parsed.mcpServers.other.command).toBe("other-tool");
    expect(parsed.mcpServers.vex.env.VEX_ENV).toBe("dev");
  });

  it("overwrites an existing vex entry", () => {
    const existing = JSON.stringify({ mcpServers: { vex: { command: "old", args: [] } } });
    const parsed = JSON.parse(mergeMcpJson(existing, entry));
    expect(parsed.mcpServers.vex.command).toBe("vex");
  });

  it("throws ConfigError with a hint on invalid JSON", () => {
    expect(() => mergeMcpJson("{ not json", entry)).toThrowError(ConfigError);
  });
});

describe("getExistingVexEntry", () => {
  it("returns undefined for missing file or missing entry", () => {
    expect(getExistingVexEntry(undefined)).toBeUndefined();
    expect(getExistingVexEntry(JSON.stringify({ mcpServers: {} }))).toBeUndefined();
  });
  it("returns the existing entry", () => {
    const text = JSON.stringify({ mcpServers: { vex: { command: "old" } } });
    expect(getExistingVexEntry(text)).toEqual({ command: "old" });
  });
});

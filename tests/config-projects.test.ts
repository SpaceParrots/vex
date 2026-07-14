import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { rmSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

// Created inside vi.hoisted so it exists before the hoisted module imports run
// (config.ts calls homedir() at module load time). vi.importActual reaches the
// real node:os while the module itself is mocked below.
const tempHome = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { join } = await import("node:path");
  const os = await vi.importActual<typeof import("node:os")>("node:os");
  return mkdtempSync(join(os.tmpdir(), "vex-config-test-"));
});

vi.mock("node:os", async (orig) => {
  const actual = await orig<typeof import("node:os")>();
  return { ...actual, homedir: () => tempHome };
});

import {
  addEnv,
  removeEnv,
  linkProject,
  unlinkProject,
  loadConfig,
  normalizeProjectPath,
  saveConfig,
} from "../src/config.js";
import { ConfigError, EnvNotFoundError, VexError } from "../src/errors.js";

const DEV = { url: "https://dev.example.com/admin-api", apiKey: "k" };

beforeEach(async () => {
  await saveConfig({ activeEnvironment: "", environments: {} });
});
afterAll(() => rmSync(tempHome, { recursive: true, force: true }));

describe("normalizeProjectPath", () => {
  it("resolves to an absolute path and strips trailing separators", () => {
    expect(normalizeProjectPath("./x/")).toBe(normalizeProjectPath(resolve("x")));
  });
  it("is case-insensitive on win32", () => {
    if (process.platform !== "win32") return;
    expect(normalizeProjectPath("D:\\Shop")).toBe(normalizeProjectPath("d:\\shop"));
  });
});

describe("linkProject / unlinkProject", () => {
  it("links a path to an env and persists it", async () => {
    await addEnv("dev", DEV);
    await linkProject("D:\\Shop\\backend", "dev");
    const config = await loadConfig();
    expect(Object.values(config.projects ?? {})).toEqual(["dev"]);
  });

  it("rejects linking to an unknown env", async () => {
    await expect(linkProject("D:\\Shop", "nope")).rejects.toBeInstanceOf(EnvNotFoundError);
  });

  it("re-linking the same path (case-insensitively on win32) replaces the entry", async () => {
    await addEnv("dev", DEV);
    await addEnv("staging", DEV);
    await linkProject("D:\\Shop\\backend", "dev");
    await linkProject("D:\\Shop\\backend", "staging");
    const config = await loadConfig();
    expect(Object.keys(config.projects ?? {})).toHaveLength(1);
    expect(Object.values(config.projects ?? {})).toEqual(["staging"]);
  });

  it("unlink removes the entry and throws when nothing is linked", async () => {
    await addEnv("dev", DEV);
    await linkProject("D:\\Shop\\backend", "dev");
    await unlinkProject("D:\\Shop\\backend");
    expect((await loadConfig()).projects).toEqual({});
    await expect(unlinkProject("D:\\Shop\\backend")).rejects.toBeInstanceOf(VexError);
  });

  it("removeEnv drops project links pointing at the removed env", async () => {
    await addEnv("dev", DEV);
    await linkProject("D:\\Shop\\backend", "dev");
    await removeEnv("dev");
    expect((await loadConfig()).projects).toEqual({});
  });
});

describe("loadConfig validates the on-disk file", () => {
  const configFile = join(tempHome, ".vendure-vex", "config.json");

  it("rejects a file that is not valid JSON", async () => {
    writeFileSync(configFile, "{ not json", "utf-8");
    await expect(loadConfig()).rejects.toBeInstanceOf(ConfigError);
    await expect(loadConfig()).rejects.toThrow(/not valid JSON/);
  });

  it("rejects valid JSON that is not a config object", async () => {
    writeFileSync(configFile, JSON.stringify(["nope"]), "utf-8");
    await expect(loadConfig()).rejects.toBeInstanceOf(ConfigError);
  });

  it("rejects a config missing the environments map", async () => {
    writeFileSync(configFile, JSON.stringify({ activeEnvironment: "dev" }), "utf-8");
    await expect(loadConfig()).rejects.toThrow(/not a valid vex config/);
  });

  it("carries an actionable hint rather than a bare parse error", async () => {
    writeFileSync(configFile, "{ not json", "utf-8");
    await expect(loadConfig()).rejects.toMatchObject({
      hint: expect.stringContaining("vex env add"),
    });
  });

  it("accepts a well-formed config, with or without project links", async () => {
    writeFileSync(
      configFile,
      JSON.stringify({ activeEnvironment: "dev", environments: { dev: DEV } }),
      "utf-8"
    );
    expect((await loadConfig()).environments.dev).toEqual(DEV);

    writeFileSync(
      configFile,
      JSON.stringify({
        activeEnvironment: "dev",
        environments: { dev: DEV },
        projects: { "/repos/shop": "dev" },
      }),
      "utf-8"
    );
    expect((await loadConfig()).projects).toEqual({ "/repos/shop": "dev" });
  });
});

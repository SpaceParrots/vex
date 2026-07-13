import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { homedir } from "node:os";

// Test setup: use a real temp directory in the system temp, not user home
// This avoids the need to mock homedir before config.ts imports
const testConfigHome = mkdtempSync(join(tmpdir(), "vex-config-test-"));

import {
  addEnv,
  removeEnv,
  linkProject,
  unlinkProject,
  loadConfig,
  normalizeProjectPath,
  saveConfig,
} from "../src/config.js";
import { EnvNotFoundError, VexError } from "../src/errors.js";

const DEV = { url: "https://dev.example.com/admin-api", apiKey: "k" };

beforeEach(async () => {
  await saveConfig({ activeEnvironment: "", environments: {} });
});

afterAll(() => rmSync(testConfigHome, { recursive: true, force: true }));

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

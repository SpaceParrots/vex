import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GraphQLObjectType } from "graphql";
import { parseSchemaFromSdl, clearSchemaCache } from "../../src/schema-model/parse.js";
import { reachableLeafPaths } from "../../src/schema-model/walk.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(__dirname, "../fixtures/schema.graphql"), "utf-8");

beforeEach(() => clearSchemaCache());

describe("reachableLeafPaths", () => {
  it("returns scalars at depth 1", () => {
    const schema = parseSchemaFromSdl("w1", fixture);
    const t = schema.getType("Customer") as GraphQLObjectType;
    const paths = reachableLeafPaths(t, { maxDepth: 1 }).map((p) => p.path);
    expect(paths).toContain("id");
    expect(paths).toContain("firstName");
    expect(paths).not.toContain("addresses.id");
    expect(paths).not.toContain("customFields.vatId");
  });

  it("descends into objects up to maxDepth", () => {
    const schema = parseSchemaFromSdl("w2", fixture);
    const t = schema.getType("Customer") as GraphQLObjectType;
    const paths = reachableLeafPaths(t, { maxDepth: 3 }).map((p) => p.path);
    expect(paths).toContain("addresses.streetLine1");
    expect(paths).toContain("addresses.country.code");
    expect(paths).toContain("customFields.vatId");
  });

  it("annotates each path with the leaf scalar type name", () => {
    const schema = parseSchemaFromSdl("w3", fixture);
    const t = schema.getType("Customer") as GraphQLObjectType;
    const all = reachableLeafPaths(t, { maxDepth: 3 });
    const id = all.find((p) => p.path === "id");
    const code = all.find((p) => p.path === "addresses.country.code");
    expect(id?.typeName).toBe("ID");
    expect(code?.typeName).toBe("String");
  });

  it("stops on cycles (recursive types)", () => {
    const sdl = `
      type Node { id: ID! parent: Node }
      type Query { root: Node }
    `;
    const schema = parseSchemaFromSdl("cycle", sdl);
    const t = schema.getType("Node") as GraphQLObjectType;
    const paths = reachableLeafPaths(t, { maxDepth: 10 }).map((p) => p.path);
    expect(paths).toEqual(["id", "parent.id"]);
  });
});

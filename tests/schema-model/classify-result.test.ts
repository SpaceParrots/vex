import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GraphQLObjectType, GraphQLUnionType } from "graphql";
import { parseSchemaFromSdl, clearSchemaCache } from "../../src/schema-model/parse.js";
import {
  errorBranches,
  successBranches,
  hasTypedCustomFields,
  customFieldsType,
} from "../../src/schema-model/classify.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(__dirname, "../fixtures/schema.graphql"), "utf-8");

beforeEach(() => clearSchemaCache());

describe("errorBranches / successBranches", () => {
  it("splits a union by ErrorResult interface", () => {
    const schema = parseSchemaFromSdl("e1", fixture);
    const u = schema.getType("CreateCustomerResult") as GraphQLUnionType;
    const errs = errorBranches(u).map((t) => t.name);
    const oks = successBranches(u).map((t) => t.name);
    expect(errs).toEqual(["EmailAddressConflictError"]);
    expect(oks).toEqual(["Customer"]);
  });

  it("falls back to structural detection (errorCode + message)", () => {
    const sdl = `
      type Ok { id: ID! }
      type Bad { errorCode: String! message: String! }
      union R = Ok | Bad
      type Query { x: R }
    `;
    const schema = parseSchemaFromSdl("e2", sdl);
    const u = schema.getType("R") as GraphQLUnionType;
    expect(errorBranches(u).map((t) => t.name)).toEqual(["Bad"]);
    expect(successBranches(u).map((t) => t.name)).toEqual(["Ok"]);
  });

  it("returns empty error branches when none match", () => {
    const sdl = `
      type A { id: ID! }
      type B { id: ID! }
      union R = A | B
      type Query { x: R }
    `;
    const schema = parseSchemaFromSdl("e3", sdl);
    const u = schema.getType("R") as GraphQLUnionType;
    expect(errorBranches(u)).toEqual([]);
    expect(successBranches(u).map((t) => t.name)).toEqual(["A", "B"]);
  });
});

describe("hasTypedCustomFields / customFieldsType", () => {
  it("detects typed customFields on Customer", () => {
    const schema = parseSchemaFromSdl("c1", fixture);
    const t = schema.getType("Customer") as GraphQLObjectType;
    expect(hasTypedCustomFields(t)).toBe(true);
    expect(customFieldsType(t)?.name).toBe("CustomerCustomFields");
  });

  it("returns false when customFields is JSON-typed", () => {
    const sdl = `
      scalar JSON
      type Foo { id: ID! customFields: JSON }
      type Query { f: Foo }
    `;
    const schema = parseSchemaFromSdl("c2", sdl);
    const t = schema.getType("Foo") as GraphQLObjectType;
    expect(hasTypedCustomFields(t)).toBe(false);
    expect(customFieldsType(t)).toBeNull();
  });

  it("returns false when customFields is absent", () => {
    const schema = parseSchemaFromSdl("c3", fixture);
    const t = schema.getType("Country") as GraphQLObjectType;
    expect(hasTypedCustomFields(t)).toBe(false);
    expect(customFieldsType(t)).toBeNull();
  });
});

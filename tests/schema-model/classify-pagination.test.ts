import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GraphQLObjectType, GraphQLInputObjectType } from "graphql";
import { parseSchemaFromSdl, clearSchemaCache } from "../../src/schema-model/parse.js";
import {
  isPaginatedList,
  paginatedItemType,
  isListOptionsInput,
} from "../../src/schema-model/classify.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(__dirname, "../fixtures/schema.graphql"), "utf-8");

beforeEach(() => clearSchemaCache());

describe("isPaginatedList", () => {
  it("returns true for a type implementing PaginatedList", () => {
    const schema = parseSchemaFromSdl("t1", fixture);
    const t = schema.getType("CustomerList") as GraphQLObjectType;
    expect(isPaginatedList(t)).toBe(true);
  });

  it("returns false for plain object types", () => {
    const schema = parseSchemaFromSdl("t2", fixture);
    const t = schema.getType("Customer") as GraphQLObjectType;
    expect(isPaginatedList(t)).toBe(false);
  });

  it("returns true for structural fallback (items + totalItems)", () => {
    const sdl = `
      type Foo { id: ID! }
      type FooList { items: [Foo!]! totalItems: Int! }
      type Query { foos: FooList! }
    `;
    const schema = parseSchemaFromSdl("structural", sdl);
    const t = schema.getType("FooList") as GraphQLObjectType;
    expect(isPaginatedList(t)).toBe(true);
  });
});

describe("paginatedItemType", () => {
  it("returns the element type of `items`", () => {
    const schema = parseSchemaFromSdl("p1", fixture);
    const list = schema.getType("CustomerList") as GraphQLObjectType;
    const item = paginatedItemType(list);
    expect(item).toBeInstanceOf(GraphQLObjectType);
    expect((item as GraphQLObjectType).name).toBe("Customer");
  });
});

describe("isListOptionsInput", () => {
  it("returns true for *ListOptions with take and skip", () => {
    const schema = parseSchemaFromSdl("l1", fixture);
    const t = schema.getType("CustomerListOptions") as GraphQLInputObjectType;
    expect(isListOptionsInput(t)).toBe(true);
  });

  it("returns false for inputs that only happen to be named *ListOptions", () => {
    const sdl = `
      input ProductListOptions { onlyActive: Boolean }
      type Query { x: Int }
    `;
    const schema = parseSchemaFromSdl("l2", sdl);
    const t = schema.getType("ProductListOptions") as GraphQLInputObjectType;
    expect(isListOptionsInput(t)).toBe(false);
  });

  it("returns false for non-input types", () => {
    const schema = parseSchemaFromSdl("l3", fixture);
    const t = schema.getType("Customer") as GraphQLObjectType;
    expect(isListOptionsInput(t as unknown as GraphQLInputObjectType)).toBe(false);
  });
});

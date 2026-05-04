import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
import { GraphQLSchema, GraphQLObjectType } from "graphql";
import { parseSchemaFromSdl, clearSchemaCache } from "../../src/schema-model/parse.js";

const fixture = readFileSync(join(__dirname, "../fixtures/schema.graphql"), "utf-8");

describe("parseSchemaFromSdl", () => {
  beforeEach(() => clearSchemaCache());

  it("returns a GraphQLSchema with expected types", () => {
    const schema = parseSchemaFromSdl("env-a", fixture);
    expect(schema).toBeInstanceOf(GraphQLSchema);
    const customer = schema.getType("Customer");
    expect(customer).toBeInstanceOf(GraphQLObjectType);
  });

  it("returns the same instance for repeated calls with the same SDL", () => {
    const a = parseSchemaFromSdl("env-a", fixture);
    const b = parseSchemaFromSdl("env-a", fixture);
    expect(a).toBe(b);
  });

  it("returns a fresh instance when the SDL changes", () => {
    const a = parseSchemaFromSdl("env-a", fixture);
    const b = parseSchemaFromSdl("env-a", fixture + "\n# touched");
    expect(a).not.toBe(b);
  });

  it("caches per environment name", () => {
    const a = parseSchemaFromSdl("env-a", fixture);
    const b = parseSchemaFromSdl("env-b", fixture);
    expect(a).not.toBe(b);
  });
});

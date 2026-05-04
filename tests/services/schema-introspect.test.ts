import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseSchemaFromSdl, clearSchemaCache } from "../../src/schema-model/parse.js";
import {
  describeType,
  listCustomFields,
  listOperations,
  describeOperation,
} from "../../src/services/schema-introspect.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(__dirname, "../fixtures/schema.graphql"), "utf-8");

beforeEach(() => {
  clearSchemaCache();
});

describe("describeType", () => {
  it("returns SDL for a type and its directly referenced types", () => {
    const s = parseSchemaFromSdl("d1", fixture);
    const out = describeType(s, "Customer", 1);
    expect(out).toContain("type Customer");
    expect(out).toContain("type CustomerCustomFields"); // depth 1
    expect(out).toContain("type Address");
  });

  it("expands two layers of references at depth 2", () => {
    const s = parseSchemaFromSdl("d1b", fixture);
    const depth1 = describeType(s, "Customer", 1);
    const depth2 = describeType(s, "Customer", 2);
    // Country is reachable from Customer via Address.country — two hops.
    expect(depth1).not.toContain("type Country");
    expect(depth2).toContain("type Country");
  });

  it("excludes built-in scalars", () => {
    const s = parseSchemaFromSdl("d2", fixture);
    const out = describeType(s, "Country", 1);
    expect(out).not.toContain("scalar String");
    expect(out).not.toContain("scalar ID");
  });

  it("throws when the type is unknown", () => {
    const s = parseSchemaFromSdl("d3", fixture);
    expect(() => describeType(s, "Nope", 1)).toThrow(/Nope/);
  });
});

describe("listCustomFields", () => {
  it("returns custom fields for Customer", () => {
    const s = parseSchemaFromSdl("c1", fixture);
    const out = listCustomFields(s, "Customer");
    expect(out.customFields).not.toBeNull();
    expect(out.customFields?.map((f) => f.name).sort()).toEqual(["loyaltyPoints", "vatId"]);
  });

  it("returns null when type has no customFields", () => {
    const s = parseSchemaFromSdl("c2", fixture);
    const out = listCustomFields(s, "Country");
    expect(out.customFields).toBeNull();
    expect(out.message).toBeTruthy();
  });
});

describe("listOperations", () => {
  it("lists all queries and mutations by default", () => {
    const s = parseSchemaFromSdl("o1", fixture);
    const all = listOperations(s);
    expect(all.find((o) => o.name === "customers")?.kind).toBe("query");
    expect(all.find((o) => o.name === "createCustomer")?.kind).toBe("mutation");
  });

  it("filters by kind and substring", () => {
    const s = parseSchemaFromSdl("o2", fixture);
    const onlyQ = listOperations(s, { kind: "query" });
    expect(onlyQ.every((o) => o.kind === "query")).toBe(true);
    const onlyCust = listOperations(s, { search: "cust" });
    expect(onlyCust.every((o) => o.name.toLowerCase().includes("cust"))).toBe(true);
  });
});

describe("describeOperation", () => {
  it("returns SDL for an operation and its referenced types", () => {
    const s = parseSchemaFromSdl("op1", fixture);
    const out = describeOperation(s, "customers");
    expect(out).toContain("customers(options: CustomerListOptions): CustomerList!");
    expect(out).toContain("input CustomerListOptions");
    expect(out).toContain("type CustomerList");
  });

  it("throws when the operation does not exist", () => {
    const s = parseSchemaFromSdl("op2", fixture);
    expect(() => describeOperation(s, "nope")).toThrow(/nope/i);
  });
});

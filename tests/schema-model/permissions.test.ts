import { describe, it, expect } from "vitest";
import {
  parsePermissions,
  suggestPermissions,
  extractOperationField,
} from "../../src/schema-model/permissions.js";

const SDL = `
type Query { dummy: String }

"""Permissions enum"""
enum Permission {
  """Grants permission to create Products, Facets, Assets, Collections"""
  CreateCatalog
  CreateProduct
  ReadProduct
  UpdateProduct
  DeleteProduct
  CreateCustomer
  ReadCustomer
  UpdateOrder
  """Custom plugin permission"""
  SyncContentful
}
`;

describe("parsePermissions", () => {
  it("extracts all Permission enum values with descriptions", () => {
    const perms = parsePermissions(SDL);
    expect(perms.map((p) => p.name)).toContain("CreateProduct");
    expect(perms.map((p) => p.name)).toContain("SyncContentful");
    expect(perms.find((p) => p.name === "CreateCatalog")?.description).toContain("create Products");
  });

  it("returns an empty array when the enum is missing", () => {
    expect(parsePermissions("type Query { x: String }")).toEqual([]);
  });
});

describe("suggestPermissions", () => {
  const perms = parsePermissions(SDL);

  it("matches verb+entity exactly, including the catalog group for products", () => {
    const suggested = suggestPermissions("createProduct", perms);
    expect(suggested).toContain("CreateProduct");
    expect(suggested).toContain("CreateCatalog");
  });

  it("maps list-style verbs to Read permissions", () => {
    expect(suggestPermissions("products", perms)).toContain("ReadProduct");
  });

  it("handles plural entities", () => {
    expect(suggestPermissions("createCustomers", perms)).toContain("CreateCustomer");
  });

  it("falls back to entity-substring matches for unknown verbs", () => {
    expect(suggestPermissions("transitionOrderToState", perms)).toContain("UpdateOrder");
  });

  it("returns empty for no match", () => {
    expect(suggestPermissions("frobnicateWidget", perms)).toEqual([]);
  });
});

describe("extractOperationField", () => {
  it("returns the first root field of a mutation", () => {
    expect(extractOperationField('mutation Create($i: X!) { createProduct(input: $i) { id } }')).toBe(
      "createProduct"
    );
  });
  it("returns undefined for unparsable documents", () => {
    expect(extractOperationField("not graphql")).toBeUndefined();
  });
});

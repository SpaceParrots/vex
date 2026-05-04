import { describe, it, expect } from "vitest";
import type { Selection } from "../../src/schema-model/types.js";
import { renderDocument } from "../../src/schema-model/render.js";

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

describe("renderDocument", () => {
  it("renders a flat object selection", () => {
    const sel: Selection = {
      kind: "object",
      fields: { id: { kind: "scalar" }, firstName: { kind: "scalar" } },
    };
    const doc = renderDocument({
      kind: "query",
      name: "GetCustomer",
      operationField: "customer",
      operationArgs: [{ name: "id", type: "ID!" }],
      variables: { id: "1" },
      selection: sel,
    });
    expect(normalize(doc.query)).toBe(
      normalize(`query GetCustomer($id: ID!) { customer(id: $id) { id firstName } }`)
    );
    expect(doc.variables).toEqual({ id: "1" });
  });

  it("emits args on nested fields when present in the selection", () => {
    const sel: Selection = {
      kind: "object",
      fields: {
        id: { kind: "scalar" },
        orders: {
          kind: "object",
          args: { options: { take: 5 } },
          fields: {
            items: { kind: "object", fields: { id: { kind: "scalar" } } },
            totalItems: { kind: "scalar" },
          },
        },
      },
    };
    const doc = renderDocument({
      kind: "query",
      name: "GetCustomer",
      operationField: "customer",
      operationArgs: [{ name: "id", type: "ID!" }],
      variables: { id: "1" },
      selection: sel,
    });
    expect(normalize(doc.query)).toContain("orders(options: {take: 5})");
    expect(normalize(doc.query)).toContain("items { id }");
    expect(normalize(doc.query)).toContain("totalItems");
  });

  it("renders union branches with includeTypename", () => {
    const sel: Selection = {
      kind: "union",
      includeTypename: true,
      branches: {
        Customer: { kind: "object", fields: { id: { kind: "scalar" } } },
        EmailAddressConflictError: {
          kind: "object",
          fields: { errorCode: { kind: "scalar" }, message: { kind: "scalar" } },
        },
      },
    };
    const doc = renderDocument({
      kind: "mutation",
      name: "CreateCustomer",
      operationField: "createCustomer",
      operationArgs: [{ name: "emailAddress", type: "String!" }],
      variables: { emailAddress: "a@b.c" },
      selection: sel,
    });
    expect(normalize(doc.query)).toContain("__typename");
    expect(normalize(doc.query)).toContain("... on Customer { id }");
    expect(normalize(doc.query)).toContain("... on EmailAddressConflictError { errorCode message }");
  });

  it("emits fragmentRef as a spread and appends fragment definitions", () => {
    const sel: Selection = {
      kind: "object",
      fields: { id: { kind: "scalar" }, $: { kind: "fragmentRef", name: "CustomerBasic" } },
    };
    const doc = renderDocument({
      kind: "query",
      name: "GetCustomer",
      operationField: "customer",
      operationArgs: [{ name: "id", type: "ID!" }],
      variables: { id: "1" },
      selection: sel,
      fragments: [
        {
          name: "CustomerBasic",
          sdl: "fragment CustomerBasic on Customer { firstName lastName }",
        },
      ],
    });
    expect(normalize(doc.query)).toContain("...CustomerBasic");
    expect(doc.query).toContain("fragment CustomerBasic on Customer");
  });
});

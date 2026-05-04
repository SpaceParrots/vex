import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

vi.mock("../../src/client.js", () => {
  return {
    getClient: vi.fn(async () => ({
      request: vi.fn(async (q: string, v: unknown) => ({ q, v })),
    })),
  };
});

import { parseSchemaFromSdl, clearSchemaCache } from "../../src/schema-model/parse.js";
import type { Selection } from "../../src/schema-model/types.js";
import { buildAndExecute } from "../../src/services/builder.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(__dirname, "../fixtures/schema.graphql"), "utf-8");

describe("buildAndExecute", () => {
  beforeEach(() => clearSchemaCache());

  it("constructs a paginated list query and forwards variables", async () => {
    const schema = parseSchemaFromSdl("b1", fixture);
    const sel: Selection = {
      kind: "object",
      fields: {
        items: { kind: "object", fields: { id: { kind: "scalar" }, firstName: { kind: "scalar" } } },
        totalItems: { kind: "scalar" },
      },
    };
    const result = (await buildAndExecute({
      schema,
      kind: "query",
      operationName: "customers",
      variables: { options: { take: 5, skip: 0 } },
      selection: sel,
    })) as { q: string; v: { options: { take: number } } };

    expect(result.q).toContain("query");
    expect(result.q).toContain("customers(options: $options)");
    expect(result.q).toContain("items {");
    expect(result.q).toContain("totalItems");
    expect(result.v.options.take).toBe(5);
  });

  it("constructs a mutation with union branches", async () => {
    const schema = parseSchemaFromSdl("b2", fixture);
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
    const result = (await buildAndExecute({
      schema,
      kind: "mutation",
      operationName: "createCustomer",
      variables: { emailAddress: "x@y.z" },
      selection: sel,
    })) as { q: string; v: { emailAddress: string } };

    expect(result.q).toContain("mutation");
    expect(result.q).toContain("createCustomer(emailAddress: $emailAddress)");
    expect(result.q).toContain("__typename");
    expect(result.q).toContain("... on Customer {");
    expect(result.q).toContain("id");
    expect(result.q).toContain("... on EmailAddressConflictError");
  });

  it("rejects when the operation does not exist on the schema", async () => {
    const schema = parseSchemaFromSdl("b3", fixture);
    await expect(
      buildAndExecute({
        schema,
        kind: "query",
        operationName: "doesNotExist",
        variables: {},
        selection: { kind: "object", fields: {} },
      })
    ).rejects.toThrow(/operation/i);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import {
  saveOperation,
  loadOperation,
  listOperations,
  deleteOperation,
  setOperationsRootForTests,
  mergeVariables,
  parseVarPairs,
  detectSensitiveKeys,
} from "../../src/services/operations.js";

let tmp: string;

const QUERY_DOC = `query ContentsPublished($options: ContentListOptions) {
  contents(options: $options) { items { id } totalItems }
}`;

const MUTATION_DOC = `mutation CreateAdminUser($input: CreateAdministratorInput!) {
  createAdministrator(input: $input) { ... on Administrator { id } }
}`;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "vex-ops-"));
  setOperationsRootForTests(tmp);
});

describe("saveOperation", () => {
  it("writes a JSON record to {envName}/{Name}.json", async () => {
    const meta = await saveOperation({
      envName: "env1",
      name: "ContentsPublished",
      kind: "query",
      rootField: "contents",
      document: QUERY_DOC,
      variables: { options: { take: 10, filter: { isPublished: { eq: true } } } },
    });
    expect(meta.name).toBe("ContentsPublished");
    expect(meta.kind).toBe("query");
    expect(existsSync(join(tmp, "env1", "ContentsPublished.json"))).toBe(true);
    const parsed = JSON.parse(
      readFileSync(join(tmp, "env1", "ContentsPublished.json"), "utf-8")
    );
    expect(parsed.document).toContain("query ContentsPublished");
    expect(parsed.variables.options.filter.isPublished.eq).toBe(true);
    expect(parsed.createdAt).toBe(parsed.updatedAt);
  });

  it("rejects names that do not match the identifier regex", async () => {
    await expect(
      saveOperation({
        envName: "env1",
        name: "1bad",
        kind: "query",
        rootField: "contents",
        document: QUERY_DOC,
        variables: {},
      })
    ).rejects.toThrow(/must match/i);
    await expect(
      saveOperation({
        envName: "env1",
        name: "bad-name",
        kind: "query",
        rootField: "contents",
        document: QUERY_DOC,
        variables: {},
      })
    ).rejects.toThrow(/must match/i);
  });

  it("rejects an unparseable document", async () => {
    await expect(
      saveOperation({
        envName: "env1",
        name: "Bad",
        kind: "query",
        rootField: "contents",
        document: "this is not graphql",
        variables: {},
      })
    ).rejects.toThrow();
  });

  it("rejects when kind does not match the document", async () => {
    await expect(
      saveOperation({
        envName: "env1",
        name: "WrongKind",
        kind: "mutation",
        rootField: "contents",
        document: QUERY_DOC,
        variables: {},
      })
    ).rejects.toThrow(/kind is "mutation"/);
  });

  it("refuses overwrite by default; allows with overwrite:true and preserves createdAt", async () => {
    const first = await saveOperation({
      envName: "env1",
      name: "Op",
      kind: "query",
      rootField: "contents",
      document: QUERY_DOC,
      variables: { options: { take: 1 } },
    });
    await expect(
      saveOperation({
        envName: "env1",
        name: "Op",
        kind: "query",
        rootField: "contents",
        document: QUERY_DOC,
        variables: { options: { take: 2 } },
      })
    ).rejects.toThrow(/exists/i);

    // Wait a millisecond so updatedAt advances.
    await new Promise((r) => setTimeout(r, 5));
    const second = await saveOperation({
      envName: "env1",
      name: "Op",
      kind: "query",
      rootField: "contents",
      document: QUERY_DOC,
      variables: { options: { take: 2 } },
      overwrite: true,
    });
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt >= first.updatedAt).toBe(true);
    const loaded = await loadOperation({ envName: "env1", name: "Op" });
    expect((loaded.variables.options as { take: number }).take).toBe(2);
  });
});

describe("loadOperation", () => {
  it("returns the full saved record", async () => {
    await saveOperation({
      envName: "env1",
      name: "Op",
      kind: "mutation",
      rootField: "createAdministrator",
      document: MUTATION_DOC,
      variables: { input: { emailAddress: "x@y.z" } },
    });
    const rec = await loadOperation({ envName: "env1", name: "Op" });
    expect(rec.kind).toBe("mutation");
    expect(rec.rootField).toBe("createAdministrator");
    expect(rec.document).toContain("mutation CreateAdminUser");
    expect(rec.variables).toEqual({ input: { emailAddress: "x@y.z" } });
  });

  it("throws a clear error when the operation does not exist", async () => {
    await expect(loadOperation({ envName: "env1", name: "Missing" })).rejects.toThrow(
      /not found/
    );
  });
});

describe("listOperations", () => {
  it("returns an empty array when no operations exist", async () => {
    expect(await listOperations({ envName: "empty" })).toEqual([]);
  });

  it("filters by kind and rootField, sorted newest first", async () => {
    await saveOperation({
      envName: "env1",
      name: "Older",
      kind: "query",
      rootField: "contents",
      document: QUERY_DOC,
      variables: {},
    });
    await new Promise((r) => setTimeout(r, 10));
    await saveOperation({
      envName: "env1",
      name: "Newer",
      kind: "query",
      rootField: "contents",
      document: QUERY_DOC,
      variables: {},
    });
    await saveOperation({
      envName: "env1",
      name: "Mut",
      kind: "mutation",
      rootField: "createAdministrator",
      document: MUTATION_DOC,
      variables: {},
    });

    const all = await listOperations({ envName: "env1" });
    expect(all).toHaveLength(3);
    expect(all[all.length - 1].name).toBe("Older");
    expect(new Set(all.map((m) => m.name))).toEqual(new Set(["Mut", "Newer", "Older"]));

    const queries = await listOperations({ envName: "env1", kind: "query" });
    expect(queries.map((m) => m.name).sort()).toEqual(["Newer", "Older"]);

    const onlyContents = await listOperations({
      envName: "env1",
      rootField: "contents",
    });
    expect(onlyContents.map((m) => m.name).sort()).toEqual(["Newer", "Older"]);
  });
});

describe("deleteOperation", () => {
  it("returns deleted:false when missing, deleted:true when removed", async () => {
    expect(await deleteOperation({ envName: "env1", name: "Missing" })).toMatchObject({
      deleted: false,
    });

    await saveOperation({
      envName: "env1",
      name: "Doomed",
      kind: "query",
      rootField: "contents",
      document: QUERY_DOC,
      variables: {},
    });
    const path = join(tmp, "env1", "Doomed.json");
    expect(existsSync(path)).toBe(true);
    expect(await deleteOperation({ envName: "env1", name: "Doomed" })).toMatchObject({
      deleted: true,
    });
    expect(existsSync(path)).toBe(false);
  });
});

describe("mergeVariables", () => {
  it("shallow-merges top-level keys with overrides taking precedence", () => {
    const merged = mergeVariables(
      { options: { take: 10 }, other: 1 },
      { options: { take: 20 } }
    );
    expect(merged).toEqual({ options: { take: 20 }, other: 1 });
  });
});

describe("parseVarPairs", () => {
  it("JSON-parses values when valid, otherwise keeps strings", () => {
    expect(parseVarPairs(["take=10", "name=hello"])).toEqual({
      take: 10,
      name: "hello",
    });
  });

  it("parses booleans, arrays, and objects", () => {
    expect(parseVarPairs(["flag=true", "ids=[1,2]", 'opts={"take":5}'])).toEqual({
      flag: true,
      ids: [1, 2],
      opts: { take: 5 },
    });
  });

  it("rejects pairs without `=`", () => {
    expect(() => parseVarPairs(["bareword"])).toThrow(/Invalid --var/);
    expect(() => parseVarPairs(["=novalue"])).toThrow(/Invalid --var/);
  });

  it("rejects reserved JS keys to prevent prototype pollution", () => {
    expect(() => parseVarPairs(["__proto__={}"])).toThrow(/Reserved key/);
    expect(() => parseVarPairs(["constructor=1"])).toThrow(/Reserved key/);
    expect(() => parseVarPairs(["prototype=1"])).toThrow(/Reserved key/);

    // Sanity: a successful parse does not leak onto Object.prototype.
    parseVarPairs(["safe=1"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("mergeVariables — prototype pollution guards", () => {
  it("rejects reserved keys in either operand", () => {
    // JS object literals treat __proto__ as the prototype setter, so build
    // the poisoned object via JSON.parse to get a real own `__proto__` key.
    const proto = JSON.parse('{"__proto__":{"polluted":true}}') as Record<string, unknown>;
    expect(() => mergeVariables(proto, {})).toThrow(/Reserved key/);
    expect(() => mergeVariables({}, proto)).toThrow(/Reserved key/);

    const ctor = JSON.parse('{"constructor":1}') as Record<string, unknown>;
    expect(() => mergeVariables({}, ctor)).toThrow(/Reserved key/);
  });
});

describe("saveOperation / loadOperation — path safety and validation", () => {
  it("rejects path-traversal envNames", async () => {
    await expect(
      saveOperation({
        envName: "../escape",
        name: "Op",
        kind: "query",
        rootField: "contents",
        document: QUERY_DOC,
        variables: {},
      })
    ).rejects.toThrow(/Environment name/);
    await expect(
      loadOperation({ envName: "..", name: "Op" })
    ).rejects.toThrow(/Environment name/);
    await expect(
      deleteOperation({ envName: "a/b", name: "Op" })
    ).rejects.toThrow(/Environment name/);
  });

  it("rejects path-traversal operation names on load and delete", async () => {
    await expect(loadOperation({ envName: "env1", name: "../bad" })).rejects.toThrow(
      /must match/
    );
    await expect(deleteOperation({ envName: "env1", name: "../bad" })).rejects.toThrow(
      /must match/
    );
  });

  it("rejects loading malformed on-disk JSON", async () => {
    const dir = join(tmp, "env1");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "Broken.json"), '{"name":"Broken"}', "utf-8");
    await expect(loadOperation({ envName: "env1", name: "Broken" })).rejects.toThrow(
      /missing or has wrong type/
    );
  });

  it("rejects loading a file with invalid JSON", async () => {
    const dir = join(tmp, "env1");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "Garbage.json"), "not json at all", "utf-8");
    await expect(loadOperation({ envName: "env1", name: "Garbage" })).rejects.toThrow(
      /not valid JSON/
    );
  });

  it("rejects loading variables that contain reserved keys", async () => {
    const dir = join(tmp, "env1");
    mkdirSync(dir, { recursive: true });
    // Hand-write the JSON so `__proto__` is a real own property on `variables`,
    // not the JS prototype setter that would be silently dropped by JSON.stringify.
    const maliciousJson = JSON.stringify({
      name: "Mal",
      kind: "query",
      rootField: "contents",
      document: QUERY_DOC,
      variables: {},
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }).replace('"variables":{}', '"variables":{"__proto__":{"polluted":true}}');
    writeFileSync(join(dir, "Mal.json"), maliciousJson, "utf-8");
    await expect(loadOperation({ envName: "env1", name: "Mal" })).rejects.toThrow(
      /Reserved key/
    );
  });
});

describe("detectSensitiveKeys", () => {
  it("flags top-level and one-level-nested credential-like keys", () => {
    expect(
      detectSensitiveKeys({ password: "x", username: "u" })
    ).toEqual(["password"]);
    expect(
      detectSensitiveKeys({ input: { emailAddress: "x", password: "y", token: "z" } })
    ).toEqual(expect.arrayContaining(["input.password", "input.token"]));
  });

  it("returns empty for benign variables", () => {
    expect(detectSensitiveKeys({ options: { take: 10, skip: 0 } })).toEqual([]);
  });
});

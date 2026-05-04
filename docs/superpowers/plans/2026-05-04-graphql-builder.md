# GraphQL Builder + MCP Schema Introspection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a generic schema-driven GraphQL operation builder to Vex — interactive CLI wizard for humans, schema-introspection MCP tools (plus saved-fragment CRUD) for agents. Custom-fields-aware throughout.

**Architecture:** Three new layers slot into the existing `services/commands/tools` triad: a pure `schema-model/` (parse, classify, walk, render Selection trees), a `services/builder.ts` + `services/fragments.ts` for execution and persisted GraphQL fragments, and a `wizard/` of clack prompts. The selection model is a small discriminated union shared across wizard, fragment loader, and renderer.

**Tech Stack:** TypeScript, Node 20+, ESM (`Node16` module resolution — note: relative imports use `.js` extension), `graphql` (already a dep) for parsing/AST/schema, `@clack/prompts` (new) for the wizard, `commander` (existing), `@modelcontextprotocol/sdk` (existing), `vitest` (new dev dep) for unit tests.

**Spec:** `docs/superpowers/specs/2026-05-04-graphql-builder-design.md`

---

## Conventions used throughout this plan

- **Imports:** ESM with `.js` suffix on relative paths (per existing project, e.g. `from "../client.js"`).
- **Tests:** Live under `tests/` mirroring `src/` paths (e.g. `tests/schema-model/parse.test.ts`). Excluded from `tsc` build via `tsconfig.json`. Vitest picks them up automatically.
- **Assertions:** Vitest's `expect`. No custom matchers.
- **Test fixtures:** A shared SDL fixture lives at `tests/fixtures/schema.graphql` (created in Task 1) and is loaded by every schema-model test. Defined in full in Task 1 Step 4.
- **Commits:** Conventional Commits, single line, no co-author (per global rules). Commit after every task; never amend.
- **No `any`** in production code. Use `unknown` for external boundaries and narrow.
- **Build verification after each task:** `npm run typecheck && npm test` must both pass before commit. The plan calls these out.

---

## Task 1: Test infrastructure (Vitest + shared fixture)

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Modify: `tsconfig.json`
- Create: `tests/fixtures/schema.graphql`
- Create: `tests/smoke.test.ts`

- [ ] **Step 1.1 — Install vitest + coverage provider**

Run:
```
npm install --save-dev vitest@^2.1.0 @vitest/coverage-v8@^2.1.0
```

Expected: both packages added to `devDependencies`; lockfile updated. (`@vitest/coverage-v8` is required because the v8 coverage provider is no longer bundled with `vitest` itself in v2.)

- [ ] **Step 1.2 — Add test scripts and update tsconfig**

Edit `package.json` `scripts`:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

(Insert after `"typecheck"`. Keep all other scripts unchanged.)

Edit `tsconfig.json` `exclude` to add `"tests"`:
```json
"exclude": ["node_modules", "dist", "tests"]
```

- [ ] **Step 1.3 — Create vitest config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/schema-model/**", "src/services/builder.ts", "src/services/fragments.ts"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
```

- [ ] **Step 1.4 — Create shared SDL fixture**

Create `tests/fixtures/schema.graphql` with the exact content below. This fixture is reused by every schema-model and builder test in subsequent tasks; do not modify it without revisiting those tests.

```graphql
interface PaginatedList {
  totalItems: Int!
}

interface ErrorResult {
  errorCode: String!
  message: String!
}

enum SortOrder {
  ASC
  DESC
}

input StringOperators {
  eq: String
  contains: String
  in: [String!]
}

input CustomerSortParameter {
  id: SortOrder
  firstName: SortOrder
}

input CustomerFilterParameter {
  emailAddress: StringOperators
  firstName: StringOperators
}

input CustomerListOptions {
  take: Int
  skip: Int
  filter: CustomerFilterParameter
  sort: CustomerSortParameter
}

input OrderListOptions {
  take: Int
  skip: Int
}

type Country {
  id: ID!
  code: String!
  name: String!
}

type Address {
  id: ID!
  streetLine1: String!
  city: String!
  country: Country!
}

type Order {
  id: ID!
  code: String!
  total: Int!
  state: String!
}

type CustomerCustomFields {
  vatId: String
  loyaltyPoints: Int
}

type Customer {
  id: ID!
  firstName: String!
  lastName: String!
  emailAddress: String!
  customFields: CustomerCustomFields
  orders(options: OrderListOptions): OrderList!
  addresses: [Address!]!
}

type CustomerList implements PaginatedList {
  items: [Customer!]!
  totalItems: Int!
}

type OrderList implements PaginatedList {
  items: [Order!]!
  totalItems: Int!
}

type EmailAddressConflictError implements ErrorResult {
  errorCode: String!
  message: String!
}

union CreateCustomerResult = Customer | EmailAddressConflictError

type Query {
  customers(options: CustomerListOptions): CustomerList!
  customer(id: ID!): Customer
}

type Mutation {
  createCustomer(emailAddress: String!): CreateCustomerResult!
}
```

- [ ] **Step 1.5 — Smoke test to verify Vitest works**

Create `tests/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("vitest smoke", () => {
  it("loads the shared SDL fixture", () => {
    const sdl = readFileSync(join(__dirname, "fixtures/schema.graphql"), "utf-8");
    expect(sdl).toContain("type Customer");
    expect(sdl).toContain("interface PaginatedList");
  });
});
```

- [ ] **Step 1.6 — Run tests and typecheck**

Run:
```
npm test
npm run typecheck
```

Expected: 1 test passes, no type errors.

- [ ] **Step 1.7 — Commit**

```
git add package.json package-lock.json tsconfig.json vitest.config.ts tests/
git commit -m "test: add vitest with shared SDL fixture"
```

---

## Task 2: Add `@clack/prompts` and new constants

**Files:**
- Modify: `package.json`
- Modify: `src/constants.ts`
- Modify: `src/config.ts`

- [ ] **Step 2.1 — Install `@clack/prompts`**

Run:
```
npm install @clack/prompts@^0.8.0
```

- [ ] **Step 2.2 — Add depth constants**

Append to `src/constants.ts`:
```ts
/** Default max depth for the wizard's flat path selector. */
export const DEFAULT_SELECTOR_MAX_DEPTH = 3;

/** Hard cap for the flat path selector's --max-depth flag. */
export const MAX_SELECTOR_DEPTH = 6;
```

- [ ] **Step 2.3 — Add `getFragmentsDir` helper**

In `src/config.ts`, after the existing `getSchemaPath` function, append:
```ts
const FRAGMENTS_DIR = join(CONFIG_DIR, "fragments");

/** Returns the directory where fragments for the given environment are stored. */
export function getFragmentsDir(envName: string): string {
  return join(FRAGMENTS_DIR, envName);
}
```

- [ ] **Step 2.4 — Verify build**

Run:
```
npm run typecheck
npm test
```

Expected: pass.

- [ ] **Step 2.5 — Commit**

```
git add package.json package-lock.json src/constants.ts src/config.ts
git commit -m "feat: add clack prompts dep, depth constants, and fragments dir helper"
```

---

## Task 3: Schema model — types

**Files:**
- Create: `src/schema-model/types.ts`

- [ ] **Step 3.1 — Write the types**

Create `src/schema-model/types.ts`:
```ts
/**
 * @module schema-model/types
 *
 * Internal shape passed between the wizard, fragment loader, builder, and renderer.
 * Never JSON-serialized for end users.
 */

/** A node in a built selection tree. */
export type Selection =
  | { readonly kind: "scalar" }
  | {
      readonly kind: "object";
      readonly fields: Readonly<Record<string, Selection>>;
      readonly args?: Readonly<Record<string, unknown>>;
    }
  | {
      readonly kind: "union";
      readonly branches: Readonly<Record<string, Selection>>;
      readonly includeTypename: boolean;
    }
  | { readonly kind: "fragmentRef"; readonly name: string };

/** Variables to be sent alongside a GraphQL operation. */
export type Variables = Readonly<Record<string, unknown>>;

/** Helper: build a `scalar` Selection node. */
export const scalar = (): Selection => ({ kind: "scalar" });
```

- [ ] **Step 3.2 — Verify build**

Run `npm run typecheck`.
Expected: pass.

- [ ] **Step 3.3 — Commit**

```
git add src/schema-model/types.ts
git commit -m "feat: add Selection and Variables types for the schema model"
```

---

## Task 4: Schema model — parse and cache

**Files:**
- Create: `src/schema-model/parse.ts`
- Create: `tests/schema-model/parse.test.ts`

- [ ] **Step 4.1 — Write the failing test**

Create `tests/schema-model/parse.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GraphQLSchema, GraphQLObjectType } from "graphql";
import { parseSchemaFromSdl, clearSchemaCache } from "../../src/schema-model/parse.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
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
```

- [ ] **Step 4.2 — Run the failing test**

Run `npm test`.
Expected: failure on missing module `parse.js`.

- [ ] **Step 4.3 — Implement `parseSchemaFromSdl`**

Create `src/schema-model/parse.ts`:
```ts
/**
 * @module schema-model/parse
 *
 * Parses cached SDL text into a `GraphQLSchema` and caches the result per
 * environment name + SDL hash. Pure (no I/O); the SDL string is the input.
 */

import { createHash } from "node:crypto";
import { buildSchema, type GraphQLSchema } from "graphql";

interface CacheEntry {
  readonly hash: string;
  readonly schema: GraphQLSchema;
}

const cache = new Map<string, CacheEntry>();

function hashSdl(sdl: string): string {
  return createHash("sha256").update(sdl).digest("hex");
}

/** Parses SDL into a `GraphQLSchema`, reusing the cached instance when SDL is unchanged. */
export function parseSchemaFromSdl(envName: string, sdl: string): GraphQLSchema {
  const hash = hashSdl(sdl);
  const cached = cache.get(envName);
  if (cached && cached.hash === hash) {
    return cached.schema;
  }
  const schema = buildSchema(sdl);
  cache.set(envName, { hash, schema });
  return schema;
}

/** Clears the in-process schema cache. Used by tests and by `vex_refetch_schema`. */
export function clearSchemaCache(envName?: string): void {
  if (envName) {
    cache.delete(envName);
  } else {
    cache.clear();
  }
}
```

- [ ] **Step 4.4 — Run tests**

Run `npm test`.
Expected: 4 tests pass in `parse.test.ts`.

- [ ] **Step 4.5 — Commit**

```
git add src/schema-model/parse.ts tests/schema-model/parse.test.ts
git commit -m "feat: add SDL parser with per-env hash cache"
```

---

## Task 5: Schema model — classify pagination helpers (PaginatedList + ListOptions)

**Files:**
- Create: `src/schema-model/classify.ts`
- Create: `tests/schema-model/classify-pagination.test.ts`

- [ ] **Step 5.1 — Write failing tests**

Create `tests/schema-model/classify-pagination.test.ts`:
```ts
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
```

- [ ] **Step 5.2 — Run failing tests**

Run `npm test -- classify-pagination`.
Expected: failure on missing module.

- [ ] **Step 5.3 — Implement classify.ts**

Create `src/schema-model/classify.ts`:
```ts
/**
 * @module schema-model/classify
 *
 * Structural detection of Vendure-shaped types in a parsed GraphQL schema.
 * No hardcoded type-name lists: all checks are based on shape (interfaces,
 * required field names/types).
 */

import {
  GraphQLObjectType,
  GraphQLInputObjectType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLScalarType,
  type GraphQLOutputType,
  type GraphQLNamedType,
  type GraphQLNamedOutputType,
} from "graphql";

/** True when the type implements a `PaginatedList` interface or has `items: [T!]!` + `totalItems: Int!`. */
export function isPaginatedList(type: GraphQLNamedType | null | undefined): boolean {
  if (!(type instanceof GraphQLObjectType)) return false;
  if (type.getInterfaces().some((i) => i.name === "PaginatedList")) return true;

  const fields = type.getFields();
  const items = fields.items?.type;
  const total = fields.totalItems?.type;
  if (!items || !total) return false;

  // items: [T!]!
  if (!(items instanceof GraphQLNonNull)) return false;
  const itemsInner = items.ofType;
  if (!(itemsInner instanceof GraphQLList)) return false;

  // totalItems: Int! (built-in Int scalar)
  if (!(total instanceof GraphQLNonNull)) return false;
  const totalInner = total.ofType;
  if (!(totalInner instanceof GraphQLScalarType) || totalInner.name !== "Int") return false;

  return true;
}

/** Returns the element type of a paginated list's `items` field, or null if not paginated. */
export function paginatedItemType(type: GraphQLNamedType | null | undefined): GraphQLNamedOutputType | null {
  if (!isPaginatedList(type)) return null;
  const obj = type as GraphQLObjectType;
  const itemsType = obj.getFields().items.type;
  // unwrap: [T!]! -> T
  let cur: GraphQLOutputType = itemsType;
  while (cur instanceof GraphQLNonNull || cur instanceof GraphQLList) {
    cur = cur.ofType as GraphQLOutputType;
  }
  return cur as GraphQLNamedOutputType;
}

/** True when the input type's name ends in "ListOptions" and it has `take` and `skip` fields. */
export function isListOptionsInput(type: GraphQLNamedType | null | undefined): boolean {
  if (!(type instanceof GraphQLInputObjectType)) return false;
  if (!type.name.endsWith("ListOptions")) return false;
  const fields = type.getFields();
  return Boolean(fields.take && fields.skip);
}
```

- [ ] **Step 5.4 — Run tests**

Run `npm test`.
Expected: all classify-pagination tests pass; existing tests still pass.

- [ ] **Step 5.5 — Commit**

```
git add src/schema-model/classify.ts tests/schema-model/classify-pagination.test.ts
git commit -m "feat: detect PaginatedList types and ListOptions inputs"
```

---

## Task 6: Schema model — classify ErrorResult and customFields

**Files:**
- Modify: `src/schema-model/classify.ts`
- Create: `tests/schema-model/classify-result.test.ts`

- [ ] **Step 6.1 — Write failing tests**

Create `tests/schema-model/classify-result.test.ts`:
```ts
import { describe, it, expect } from "vitest";
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

describe("errorBranches / successBranches", () => {
  it("splits a union by ErrorResult interface", () => {
    clearSchemaCache();
    const schema = parseSchemaFromSdl("e1", fixture);
    const u = schema.getType("CreateCustomerResult") as GraphQLUnionType;
    const errs = errorBranches(u).map((t) => t.name);
    const oks = successBranches(u).map((t) => t.name);
    expect(errs).toEqual(["EmailAddressConflictError"]);
    expect(oks).toEqual(["Customer"]);
  });

  it("falls back to structural detection (errorCode + message)", () => {
    clearSchemaCache();
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
    clearSchemaCache();
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
    clearSchemaCache();
    const schema = parseSchemaFromSdl("c1", fixture);
    const t = schema.getType("Customer") as GraphQLObjectType;
    expect(hasTypedCustomFields(t)).toBe(true);
    expect(customFieldsType(t)?.name).toBe("CustomerCustomFields");
  });

  it("returns false when customFields is JSON-typed", () => {
    clearSchemaCache();
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
    clearSchemaCache();
    const schema = parseSchemaFromSdl("c3", fixture);
    const t = schema.getType("Country") as GraphQLObjectType;
    expect(hasTypedCustomFields(t)).toBe(false);
    expect(customFieldsType(t)).toBeNull();
  });
});
```

- [ ] **Step 6.2 — Run failing tests**

Run `npm test -- classify-result`.
Expected: failures on missing exports.

- [ ] **Step 6.3 — Update the import block at the top of `classify.ts`**

Replace the existing `from "graphql"` import block with the following (adds `GraphQLUnionType`; keeps `GraphQLScalarType` and `GraphQLNamedOutputType` from Task 5):
```ts
import {
  GraphQLObjectType,
  GraphQLInputObjectType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLScalarType,
  GraphQLUnionType,
  type GraphQLOutputType,
  type GraphQLNamedType,
  type GraphQLNamedOutputType,
} from "graphql";
```

- [ ] **Step 6.4 — Append the four new exports to `classify.ts`**

Append the following code block to the end of `src/schema-model/classify.ts`. Do not add any further imports — `GraphQLObjectType`, `GraphQLNonNull`, and `GraphQLUnionType` are already in scope from Step 6.3.

```ts
/** True when the object type implements `ErrorResult` or has `errorCode: String!` + `message: String!`. */
function isReqStringField(t: unknown): boolean {
  if (!(t instanceof GraphQLNonNull)) return false;
  const inner = t.ofType;
  return inner instanceof GraphQLScalarType && inner.name === "String";
}

function isErrorBranch(t: GraphQLObjectType): boolean {
  if (t.getInterfaces().some((i) => i.name === "ErrorResult")) return true;
  const f = t.getFields();
  return isReqStringField(f.errorCode?.type) && isReqStringField(f.message?.type);
}

/** Returns the union members that look like error results. */
export function errorBranches(union: GraphQLUnionType): readonly GraphQLObjectType[] {
  return union.getTypes().filter(isErrorBranch);
}

/** Returns the union members that are NOT error results. */
export function successBranches(union: GraphQLUnionType): readonly GraphQLObjectType[] {
  return union.getTypes().filter((t) => !isErrorBranch(t));
}

/** True when the type has `customFields` whose type is a non-null typed object (not JSON). */
export function hasTypedCustomFields(type: GraphQLObjectType | null | undefined): boolean {
  return customFieldsType(type) !== null;
}

/** Returns the `customFields` sub-object type, or null if customFields is absent or JSON-typed. */
export function customFieldsType(type: GraphQLObjectType | null | undefined): GraphQLObjectType | null {
  if (!type) return null;
  const f = type.getFields().customFields;
  if (!f) return null;
  let inner: unknown = f.type;
  while (inner instanceof GraphQLNonNull) {
    inner = inner.ofType;
  }
  if (inner instanceof GraphQLObjectType) return inner;
  return null;
}
```

- [ ] **Step 6.5 — Run tests + typecheck**

Run:
```
npm test
npm run typecheck
```

Expected: all classify tests pass; no type errors.

- [ ] **Step 6.6 — Commit**

```
git add src/schema-model/classify.ts tests/schema-model/classify-result.test.ts
git commit -m "feat: detect ErrorResult unions and typed customFields"
```

---

## Task 7: Schema model — walk reachable leaf paths

**Files:**
- Create: `src/schema-model/walk.ts`
- Create: `tests/schema-model/walk.test.ts`

- [ ] **Step 7.1 — Write failing tests**

Create `tests/schema-model/walk.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GraphQLObjectType } from "graphql";
import { parseSchemaFromSdl, clearSchemaCache } from "../../src/schema-model/parse.js";
import { reachableLeafPaths } from "../../src/schema-model/walk.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(__dirname, "../fixtures/schema.graphql"), "utf-8");

describe("reachableLeafPaths", () => {
  it("returns scalars at depth 1", () => {
    clearSchemaCache();
    const schema = parseSchemaFromSdl("w1", fixture);
    const t = schema.getType("Customer") as GraphQLObjectType;
    const paths = reachableLeafPaths(t, { maxDepth: 1 }).map((p) => p.path);
    expect(paths).toContain("id");
    expect(paths).toContain("firstName");
    expect(paths).not.toContain("addresses.id");
    expect(paths).not.toContain("customFields.vatId");
  });

  it("descends into objects up to maxDepth", () => {
    clearSchemaCache();
    const schema = parseSchemaFromSdl("w2", fixture);
    const t = schema.getType("Customer") as GraphQLObjectType;
    const paths = reachableLeafPaths(t, { maxDepth: 3 }).map((p) => p.path);
    expect(paths).toContain("addresses.streetLine1");
    expect(paths).toContain("addresses.country.code");
    expect(paths).toContain("customFields.vatId");
  });

  it("annotates each path with the leaf scalar type name", () => {
    clearSchemaCache();
    const schema = parseSchemaFromSdl("w3", fixture);
    const t = schema.getType("Customer") as GraphQLObjectType;
    const all = reachableLeafPaths(t, { maxDepth: 3 });
    const id = all.find((p) => p.path === "id");
    const code = all.find((p) => p.path === "addresses.country.code");
    expect(id?.typeName).toBe("ID");
    expect(code?.typeName).toBe("String");
  });

  it("stops on cycles (recursive types)", () => {
    clearSchemaCache();
    const sdl = `
      type Node { id: ID! parent: Node }
      type Query { root: Node }
    `;
    const schema = parseSchemaFromSdl("cycle", sdl);
    const t = schema.getType("Node") as GraphQLObjectType;
    // With maxDepth=10 a cycle would explode — verify the function caps itself.
    const paths = reachableLeafPaths(t, { maxDepth: 10 }).map((p) => p.path);
    expect(paths.length).toBeLessThan(50);
    expect(paths).toContain("id");
    expect(paths).toContain("parent.id");
  });
});
```

- [ ] **Step 7.2 — Run failing tests**

Run `npm test -- walk`.
Expected: failures on missing module.

- [ ] **Step 7.3 — Implement `walk.ts`**

Create `src/schema-model/walk.ts`:
```ts
/**
 * @module schema-model/walk
 *
 * Computes leaf-field paths reachable from a root object type, up to a
 * configurable maximum depth. A "leaf" is a scalar or enum field; object
 * fields are descended into.
 */

import {
  GraphQLObjectType,
  GraphQLNonNull,
  GraphQLList,
  GraphQLScalarType,
  GraphQLEnumType,
  type GraphQLNamedType,
  type GraphQLOutputType,
} from "graphql";

/** A leaf field reachable from the root type, with its dotted path and scalar type name. */
export interface LeafPath {
  readonly path: string;
  readonly typeName: string;
}

export interface WalkOptions {
  readonly maxDepth: number;
}

function unwrap(t: GraphQLOutputType): GraphQLOutputType {
  while (t instanceof GraphQLNonNull || t instanceof GraphQLList) {
    t = t.ofType as GraphQLOutputType;
  }
  return t;
}

function walk(
  type: GraphQLObjectType,
  prefix: string,
  depth: number,
  maxDepth: number,
  visited: ReadonlySet<string>,
  out: LeafPath[]
): void {
  if (depth > maxDepth) return;

  // Mark the current type as visited so descendants cannot recurse back into it.
  const next = new Set(visited);
  next.add(type.name);

  for (const [fieldName, field] of Object.entries(type.getFields())) {
    const inner = unwrap(field.type);
    const path = prefix ? `${prefix}.${fieldName}` : fieldName;
    if (inner instanceof GraphQLScalarType || inner instanceof GraphQLEnumType) {
      out.push({ path, typeName: inner.name });
    } else if (inner instanceof GraphQLObjectType) {
      // Only descend if the child type has not yet been seen on this path (cycle guard).
      // The check uses `visited` (parent's set) so a type's own scalars are always emitted
      // before the cycle is detected at the next descent.
      if (!visited.has(inner.name)) {
        walk(inner, path, depth + 1, maxDepth, next, out);
      }
    }
    // Interfaces/unions: skipped in the flat selector (handled via dedicated wizard escape hatches).
  }
}

/** Returns every reachable leaf-field path from `root`, capped at `maxDepth`. Cycles are detected and stopped. */
export function reachableLeafPaths(
  root: GraphQLObjectType,
  opts: WalkOptions
): readonly LeafPath[] {
  const out: LeafPath[] = [];
  walk(root, "", 1, opts.maxDepth, new Set(), out);
  return out;
}
```

- [ ] **Step 7.4 — Run tests**

Run `npm test`.
Expected: walk tests pass.

- [ ] **Step 7.5 — Commit**

```
git add src/schema-model/walk.ts tests/schema-model/walk.test.ts
git commit -m "feat: walk reachable leaf paths with cycle and depth caps"
```

---

## Task 8: Schema model — render Selection to GraphQL document

**Files:**
- Create: `src/schema-model/render.ts`
- Create: `tests/schema-model/render.test.ts`

- [ ] **Step 8.1 — Write failing tests**

Create `tests/schema-model/render.test.ts`:
```ts
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
```

- [ ] **Step 8.2 — Run failing tests**

Run `npm test -- render`.
Expected: failures on missing module.

- [ ] **Step 8.3 — Implement `render.ts`**

Create `src/schema-model/render.ts`:
```ts
/**
 * @module schema-model/render
 *
 * Renders a `Selection` tree into a complete GraphQL document string with
 * variable declarations and any referenced fragment definitions appended.
 */

import type { Selection } from "./types.js";

export interface OperationArg {
  readonly name: string;
  readonly type: string; // e.g. "ID!" or "CustomerListOptions"
}

export interface FragmentDefinition {
  readonly name: string;
  readonly sdl: string; // full "fragment X on T { ... }"
}

export interface RenderInput {
  readonly kind: "query" | "mutation";
  readonly name: string; // operation name in the document
  readonly operationField: string; // the root field being called
  readonly operationArgs: readonly OperationArg[]; // declared variables
  readonly variables: Readonly<Record<string, unknown>>;
  readonly selection: Selection;
  readonly fragments?: readonly FragmentDefinition[];
}

export interface RenderOutput {
  readonly query: string;
  readonly variables: Readonly<Record<string, unknown>>;
}

const FRAG_KEY_PREFIX = "$";

function renderInlineValue(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.map(renderInlineValue).join(", ")}]`;
  if (typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>).map(
      ([k, val]) => `${k}: ${renderInlineValue(val)}`
    );
    return `{${entries.join(", ")}}`;
  }
  return JSON.stringify(v);
}

function renderArgs(args: Readonly<Record<string, unknown>>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return "";
  return `(${entries.map(([k, v]) => `${k}: ${renderInlineValue(v)}`).join(", ")})`;
}

function renderSelection(sel: Selection, indent: string): string {
  switch (sel.kind) {
    case "scalar":
      return ""; // scalars have no body — caller emits the field name
    case "fragmentRef":
      return ""; // emitted by the parent loop as `...Name`
    case "object": {
      const inner = Object.entries(sel.fields).map(([name, child]) => {
        if (child.kind === "fragmentRef") return `${indent}  ...${child.name}`;
        if (child.kind === "scalar") return `${indent}  ${name}`;
        if (child.kind === "object") {
          const args = child.args ? renderArgs(child.args) : "";
          return `${indent}  ${name}${args} {\n${renderSelection(child, indent + "  ")}\n${indent}  }`;
        }
        // union
        return `${indent}  ${name} {\n${renderSelection(child, indent + "  ")}\n${indent}  }`;
      });
      return inner.join("\n");
    }
    case "union": {
      const lines: string[] = [];
      if (sel.includeTypename) lines.push(`${indent}  __typename`);
      for (const [type, child] of Object.entries(sel.branches)) {
        if (child.kind === "object") {
          lines.push(`${indent}  ... on ${type} {\n${renderSelection(child, indent + "  ")}\n${indent}  }`);
        }
      }
      return lines.join("\n");
    }
  }
}

function collectReferencedFragments(sel: Selection, into: Set<string>): void {
  switch (sel.kind) {
    case "fragmentRef":
      into.add(sel.name);
      return;
    case "object":
      for (const child of Object.values(sel.fields)) collectReferencedFragments(child, into);
      return;
    case "union":
      for (const child of Object.values(sel.branches)) collectReferencedFragments(child, into);
      return;
    case "scalar":
      return;
  }
}

/** Renders a complete GraphQL document for the operation, ready for `client.request()`. */
export function renderDocument(input: RenderInput): RenderOutput {
  const argList = input.operationArgs.length
    ? `(${input.operationArgs.map((a) => `$${a.name}: ${a.type}`).join(", ")})`
    : "";
  const callArgs = input.operationArgs.length
    ? `(${input.operationArgs.map((a) => `${a.name}: $${a.name}`).join(", ")})`
    : "";

  const body = renderSelection(input.selection, "  ");
  const opKw = input.kind;
  let doc = `${opKw} ${input.name}${argList} {\n  ${input.operationField}${callArgs} {\n${body}\n  }\n}\n`;

  // Append referenced fragment definitions.
  const refs = new Set<string>();
  collectReferencedFragments(input.selection, refs);
  if (input.fragments && refs.size > 0) {
    const byName = new Map(input.fragments.map((f) => [f.name, f]));
    for (const name of refs) {
      const f = byName.get(name);
      if (f) doc += `\n${f.sdl}\n`;
    }
  }

  return { query: doc, variables: input.variables };
}
```

> Note: the test in Step 8.1 uses a field key `"$"` to attach a `fragmentRef` inside a parent object. That's a convention — any non-conflicting key is fine because the renderer emits `...Name` regardless of key. Document this in a comment in the wizard layer so future readers know.

- [ ] **Step 8.4 — Run tests**

Run `npm test`.
Expected: render tests pass.

- [ ] **Step 8.5 — Commit**

```
git add src/schema-model/render.ts tests/schema-model/render.test.ts
git commit -m "feat: render Selection trees to GraphQL documents with fragment spreads"
```

---

## Task 9: Builder service

**Files:**
- Create: `src/services/builder.ts`
- Create: `tests/services/builder.test.ts`

- [ ] **Step 9.1 — Write failing tests**

Create `tests/services/builder.test.ts`:
```ts
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
    expect(result.q).toContain("... on Customer { id }");
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
```

- [ ] **Step 9.2 — Run failing tests**

Run `npm test -- builder`.
Expected: failures on missing module.

- [ ] **Step 9.3 — Implement `builder.ts`**

Create `src/services/builder.ts`:
```ts
/**
 * @module services/builder
 *
 * Bridges the schema-model layer to the network: takes a parsed schema +
 * operation name + Selection + variables, renders a GraphQL document, and
 * sends it via `getClient().request()`.
 */

import type { GraphQLSchema, GraphQLField } from "graphql";
import { GraphQLNonNull, GraphQLList } from "graphql";
import { getClient } from "../client.js";
import type { Selection } from "../schema-model/types.js";
import {
  renderDocument,
  type FragmentDefinition,
  type OperationArg,
} from "../schema-model/render.js";

export interface BuildAndExecuteInput {
  readonly schema: GraphQLSchema;
  readonly kind: "query" | "mutation";
  readonly operationName: string; // root field name on Query/Mutation
  readonly variables: Readonly<Record<string, unknown>>;
  readonly selection: Selection;
  readonly fragments?: readonly FragmentDefinition[];
}

function gqlTypeString(t: unknown): string {
  if (t instanceof GraphQLNonNull) return `${gqlTypeString(t.ofType)}!`;
  if (t instanceof GraphQLList) return `[${gqlTypeString(t.ofType)}]`;
  if (t && typeof t === "object" && "name" in t) return (t as { name: string }).name;
  return String(t);
}

function lookupOperation(
  schema: GraphQLSchema,
  kind: "query" | "mutation",
  name: string
): GraphQLField<unknown, unknown> {
  const root = kind === "query" ? schema.getQueryType() : schema.getMutationType();
  if (!root) throw new Error(`Schema has no ${kind} root type.`);
  const field = root.getFields()[name];
  if (!field) throw new Error(`No ${kind} operation named "${name}" on the schema.`);
  return field;
}

/** Builds the GraphQL document, executes it via `getClient()`, and returns the raw response. */
export async function buildAndExecute(input: BuildAndExecuteInput): Promise<unknown> {
  const field = lookupOperation(input.schema, input.kind, input.operationName);
  const operationArgs: OperationArg[] = field.args.map((a) => ({
    name: a.name,
    type: gqlTypeString(a.type),
  }));

  const docName =
    input.operationName.charAt(0).toUpperCase() + input.operationName.slice(1);

  const { query, variables } = renderDocument({
    kind: input.kind,
    name: docName,
    operationField: input.operationName,
    operationArgs,
    variables: input.variables,
    selection: input.selection,
    fragments: input.fragments,
  });

  const client = await getClient();
  return client.request(query, variables);
}

/** Render-only variant for `--dry-run`. Does not call the network. */
export function buildDocument(input: BuildAndExecuteInput): { query: string; variables: Readonly<Record<string, unknown>> } {
  const field = lookupOperation(input.schema, input.kind, input.operationName);
  const operationArgs: OperationArg[] = field.args.map((a) => ({
    name: a.name,
    type: gqlTypeString(a.type),
  }));
  const docName =
    input.operationName.charAt(0).toUpperCase() + input.operationName.slice(1);
  return renderDocument({
    kind: input.kind,
    name: docName,
    operationField: input.operationName,
    operationArgs,
    variables: input.variables,
    selection: input.selection,
    fragments: input.fragments,
  });
}
```

- [ ] **Step 9.4 — Run tests**

Run `npm test`.
Expected: builder tests pass.

- [ ] **Step 9.5 — Commit**

```
git add src/services/builder.ts tests/services/builder.test.ts
git commit -m "feat: add builder service that renders and executes GraphQL operations"
```

---

## Task 10: Fragment store — types, list, save

**Files:**
- Create: `src/services/fragments.ts`
- Create: `tests/services/fragments-save.test.ts`

- [ ] **Step 10.1 — Write failing tests**

Create `tests/services/fragments-save.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSchemaFromSdl, clearSchemaCache } from "../../src/schema-model/parse.js";
import {
  saveFragment,
  listFragments,
  setFragmentsRootForTests,
} from "../../src/services/fragments.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(__dirname, "../fixtures/schema.graphql"), "utf-8");

let tmp: string;

beforeEach(() => {
  clearSchemaCache();
  tmp = mkdtempSync(join(tmpdir(), "vex-frag-"));
  setFragmentsRootForTests(tmp);
});

describe("saveFragment", () => {
  it("writes a valid fragment to {envName}/{Name}.graphql", async () => {
    const schema = parseSchemaFromSdl("env1", fixture);
    const sdl = `fragment CustomerBasic on Customer { id firstName }`;
    const out = await saveFragment({ envName: "env1", name: "CustomerBasic", sdl, schema });
    expect(out.onType).toBe("Customer");
    expect(existsSync(join(tmp, "env1", "CustomerBasic.graphql"))).toBe(true);
  });

  it("rejects when the name does not match the fragment definition", async () => {
    const schema = parseSchemaFromSdl("env1", fixture);
    const sdl = `fragment CustomerBasic on Customer { id }`;
    await expect(
      saveFragment({ envName: "env1", name: "NotMatching", sdl, schema })
    ).rejects.toThrow(/name/i);
  });

  it("rejects when a referenced field is not in the schema", async () => {
    const schema = parseSchemaFromSdl("env1", fixture);
    const sdl = `fragment X on Customer { id nonExistentField }`;
    await expect(
      saveFragment({ envName: "env1", name: "X", sdl, schema })
    ).rejects.toThrow(/nonExistentField/);
  });

  it("refuses overwrite by default; allows with overwrite: true", async () => {
    const schema = parseSchemaFromSdl("env1", fixture);
    const sdl = `fragment Y on Customer { id }`;
    await saveFragment({ envName: "env1", name: "Y", sdl, schema });
    await expect(
      saveFragment({ envName: "env1", name: "Y", sdl, schema })
    ).rejects.toThrow(/exists/i);
    await expect(
      saveFragment({ envName: "env1", name: "Y", sdl, schema, overwrite: true })
    ).resolves.toMatchObject({ name: "Y" });
  });
});

describe("listFragments", () => {
  it("returns an empty array when no fragments exist", async () => {
    expect(await listFragments({ envName: "envEmpty" })).toEqual([]);
  });

  it("returns metadata for stored fragments and filters by onType", async () => {
    const schema = parseSchemaFromSdl("env2", fixture);
    await saveFragment({
      envName: "env2",
      name: "CustomerBasic",
      sdl: `fragment CustomerBasic on Customer { id }`,
      schema,
    });
    await saveFragment({
      envName: "env2",
      name: "OrderBasic",
      sdl: `fragment OrderBasic on Order { id code }`,
      schema,
    });
    const all = await listFragments({ envName: "env2" });
    expect(all.map((f) => f.name).sort()).toEqual(["CustomerBasic", "OrderBasic"]);
    const onlyCust = await listFragments({ envName: "env2", onType: "Customer" });
    expect(onlyCust.map((f) => f.name)).toEqual(["CustomerBasic"]);
  });
});
```

- [ ] **Step 10.2 — Run failing tests**

Run `npm test -- fragments-save`.
Expected: failures on missing module.

- [ ] **Step 10.3 — Implement save + list**

Create `src/services/fragments.ts`:
```ts
/**
 * @module services/fragments
 *
 * Per-environment GraphQL fragment storage. Files live at
 * `~/.vendure-vex/fragments/{envName}/{Name}.graphql` and contain a single
 * `fragment Name on Type { ... }` definition.
 */

import { readFile, writeFile, rename, mkdir, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  parse,
  GraphQLObjectType,
  GraphQLInterfaceType,
  GraphQLUnionType,
  GraphQLNonNull,
  GraphQLList,
  type DocumentNode,
  type FragmentDefinitionNode,
  type GraphQLSchema,
  type FieldNode,
  type SelectionSetNode,
} from "graphql";
import { getFragmentsDir } from "../config.js";

let rootOverride: string | null = null;

/** Test seam: redirect the fragments root to a tmp dir. */
export function setFragmentsRootForTests(root: string | null): void {
  rootOverride = root;
}

function envDir(envName: string): string {
  if (rootOverride) return join(rootOverride, envName);
  return getFragmentsDir(envName);
}

export interface FragmentMeta {
  readonly name: string;
  readonly onType: string;
  readonly fields: number;
  readonly path: string;
}

/* ------------------------------- save -------------------------------- */

export interface SaveFragmentInput {
  readonly envName: string;
  readonly name: string;
  readonly sdl: string;
  readonly schema: GraphQLSchema;
  readonly overwrite?: boolean;
}

const NAME_RE = /^[A-Za-z][A-Za-z0-9]*$/;

function extractFragmentDef(doc: DocumentNode): FragmentDefinitionNode {
  const defs = doc.definitions.filter(
    (d): d is FragmentDefinitionNode => d.kind === "FragmentDefinition"
  );
  if (defs.length !== 1) {
    throw new Error(`SDL must contain exactly one fragment definition (found ${defs.length}).`);
  }
  return defs[0];
}

function unwrapNamed(t: unknown): { kind: string; name?: string } {
  let cur: unknown = t;
  while (cur instanceof GraphQLNonNull || cur instanceof GraphQLList) {
    cur = (cur as { ofType: unknown }).ofType;
  }
  return cur as { kind: string; name?: string };
}

function validateSelectionAgainst(
  parentType: GraphQLObjectType | GraphQLInterfaceType | GraphQLUnionType,
  selectionSet: SelectionSetNode,
  schema: GraphQLSchema,
  pathPrefix: string
): void {
  for (const sel of selectionSet.selections) {
    if (sel.kind === "Field") {
      const f = sel as FieldNode;
      const fieldName = f.name.value;
      if (fieldName === "__typename") continue;

      // Unions don't have direct fields beyond __typename — those go via inline fragments.
      if (parentType instanceof GraphQLUnionType) {
        throw new Error(
          `Field "${fieldName}" cannot be selected directly on union "${parentType.name}" at ${pathPrefix}.`
        );
      }

      const fieldDef = parentType.getFields()[fieldName];
      if (!fieldDef) {
        throw new Error(
          `Field "${fieldName}" does not exist on type "${parentType.name}" at ${pathPrefix}.`
        );
      }
      if (f.selectionSet) {
        const inner = unwrapNamed(fieldDef.type);
        const innerType = inner.name ? schema.getType(inner.name) : null;
        if (
          innerType instanceof GraphQLObjectType ||
          innerType instanceof GraphQLInterfaceType ||
          innerType instanceof GraphQLUnionType
        ) {
          validateSelectionAgainst(
            innerType,
            f.selectionSet,
            schema,
            `${pathPrefix}.${fieldName}`
          );
        }
        // Other types with selection sets shouldn't occur in a valid GraphQL fragment — let the
        // server reject if the user inserts something exotic.
      }
    } else if (sel.kind === "InlineFragment") {
      const tName = sel.typeCondition?.name.value;
      if (!tName) continue;
      const t = schema.getType(tName);
      if (
        !(t instanceof GraphQLObjectType) &&
        !(t instanceof GraphQLInterfaceType) &&
        !(t instanceof GraphQLUnionType)
      ) {
        throw new Error(`Inline fragment refers to unknown or non-composite type "${tName}".`);
      }
      validateSelectionAgainst(t, sel.selectionSet, schema, `${pathPrefix}(${tName})`);
    }
    // FragmentSpread: validated when expanded by the loader (see Task 11). Save-time
    // validation skips spreads because the referenced fragment may not exist yet — the
    // loader catches dangling spreads with a clearer message.
  }
}

/** Saves a fragment SDL after validating it against the schema. */
export async function saveFragment(input: SaveFragmentInput): Promise<{
  name: string;
  onType: string;
  path: string;
}> {
  if (!NAME_RE.test(input.name)) {
    throw new Error(`Fragment name "${input.name}" must match ${NAME_RE.source}.`);
  }

  const doc = parse(input.sdl);
  const def = extractFragmentDef(doc);
  if (def.name.value !== input.name) {
    throw new Error(
      `Fragment name in SDL ("${def.name.value}") does not match requested name ("${input.name}").`
    );
  }
  const onType = def.typeCondition.name.value;
  const t = input.schema.getType(onType);
  if (
    !(t instanceof GraphQLObjectType) &&
    !(t instanceof GraphQLInterfaceType) &&
    !(t instanceof GraphQLUnionType)
  ) {
    throw new Error(`Type "${onType}" must be an object, interface, or union.`);
  }
  validateSelectionAgainst(t, def.selectionSet, input.schema, onType);

  const dir = envDir(input.envName);
  await mkdir(dir, { recursive: true });
  const finalPath = join(dir, `${input.name}.graphql`);
  if (existsSync(finalPath) && !input.overwrite) {
    throw new Error(`Fragment "${input.name}" already exists. Pass overwrite:true to replace.`);
  }
  const tmpPath = `${finalPath}.tmp`;
  await writeFile(tmpPath, input.sdl, "utf-8");
  await rename(tmpPath, finalPath);

  // Best-effort: count top-level field selections (for metadata).
  const _fieldCount = def.selectionSet.selections.length;

  return { name: input.name, onType, path: finalPath };
}

/* ------------------------------- list -------------------------------- */

export interface ListFragmentsInput {
  readonly envName: string;
  readonly onType?: string;
}

async function readMeta(filePath: string): Promise<FragmentMeta | null> {
  try {
    const sdl = await readFile(filePath, "utf-8");
    const doc = parse(sdl);
    const def = extractFragmentDef(doc);
    return {
      name: def.name.value,
      onType: def.typeCondition.name.value,
      fields: def.selectionSet.selections.length,
      path: filePath,
    };
  } catch {
    return null;
  }
}

/** Lists every fragment for an environment, optionally filtered by on-clause type. */
export async function listFragments(input: ListFragmentsInput): Promise<readonly FragmentMeta[]> {
  const dir = envDir(input.envName);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  const out: FragmentMeta[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".graphql")) continue;
    const meta = await readMeta(join(dir, entry));
    if (meta && (!input.onType || meta.onType === input.onType)) {
      out.push(meta);
    }
  }
  return out;
}
```

- [ ] **Step 10.4 — Run tests + typecheck**

Run:
```
npm test
npm run typecheck
```

Expected: fragments-save tests pass; existing tests still pass.

- [ ] **Step 10.5 — Commit**

```
git add src/services/fragments.ts tests/services/fragments-save.test.ts
git commit -m "feat: persist GraphQL fragments per environment with schema validation"
```

---

## Task 11: Fragment store — load with composition and cycle detection

**Files:**
- Modify: `src/services/fragments.ts`
- Create: `tests/services/fragments-load.test.ts`

- [ ] **Step 11.1 — Write failing tests**

Create `tests/services/fragments-load.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSchemaFromSdl, clearSchemaCache } from "../../src/schema-model/parse.js";
import {
  saveFragment,
  loadFragment,
  setFragmentsRootForTests,
  clearFragmentCache,
} from "../../src/services/fragments.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(__dirname, "../fixtures/schema.graphql"), "utf-8");

let tmp: string;

beforeEach(() => {
  clearSchemaCache();
  tmp = mkdtempSync(join(tmpdir(), "vex-frag-load-"));
  setFragmentsRootForTests(tmp);
  clearFragmentCache();
});

describe("loadFragment", () => {
  it("loads a fragment as a Selection tree", async () => {
    const schema = parseSchemaFromSdl("e", fixture);
    await saveFragment({
      envName: "e",
      name: "CustomerBasic",
      sdl: `fragment CustomerBasic on Customer { id firstName }`,
      schema,
    });
    const sel = await loadFragment({ envName: "e", name: "CustomerBasic", schema });
    expect(sel.kind).toBe("object");
    if (sel.kind !== "object") return;
    expect(Object.keys(sel.fields).sort()).toEqual(["firstName", "id"]);
  });

  it("inlines referenced fragments", async () => {
    const schema = parseSchemaFromSdl("e", fixture);
    await saveFragment({
      envName: "e",
      name: "AddressFull",
      sdl: `fragment AddressFull on Address { id streetLine1 city }`,
      schema,
    });
    await saveFragment({
      envName: "e",
      name: "CustomerWithAddresses",
      sdl: `fragment CustomerWithAddresses on Customer { id addresses { ...AddressFull } }`,
      schema,
    });
    const sel = await loadFragment({ envName: "e", name: "CustomerWithAddresses", schema });
    expect(sel.kind).toBe("object");
    if (sel.kind !== "object") return;
    const addresses = sel.fields.addresses;
    expect(addresses?.kind).toBe("object");
    if (addresses?.kind !== "object") return;
    expect(Object.keys(addresses.fields).sort()).toEqual(["city", "id", "streetLine1"]);
  });

  it("detects cycles", async () => {
    const schema = parseSchemaFromSdl("e", fixture);
    // graphql.parse rejects circular fragment spreads in a single doc, so write the
    // files directly to bypass save-time validation.
    const fs = await import("node:fs/promises");
    const { mkdir, writeFile } = fs;
    await mkdir(join(tmp, "e"), { recursive: true });
    await writeFile(
      join(tmp, "e", "A.graphql"),
      `fragment A on Customer { id ...B }`,
      "utf-8"
    );
    await writeFile(
      join(tmp, "e", "B.graphql"),
      `fragment B on Customer { firstName ...A }`,
      "utf-8"
    );
    await expect(loadFragment({ envName: "e", name: "A", schema })).rejects.toThrow(/cycle/i);
  });

  it("throws with the missing fragment's name when a spread references nothing", async () => {
    const schema = parseSchemaFromSdl("e", fixture);
    const fs = await import("node:fs/promises");
    const { mkdir, writeFile } = fs;
    await mkdir(join(tmp, "e"), { recursive: true });
    await writeFile(
      join(tmp, "e", "Lonely.graphql"),
      `fragment Lonely on Customer { id ...Missing }`,
      "utf-8"
    );
    await expect(loadFragment({ envName: "e", name: "Lonely", schema })).rejects.toThrow(/Missing/);
  });
});
```

- [ ] **Step 11.2 — Run failing tests**

Run `npm test -- fragments-load`.
Expected: failures on missing exports.

- [ ] **Step 11.3 — Add load + cache to `fragments.ts`**

First, **add one import** to the existing import block at the top of `src/services/fragments.ts`. Find the line `import { getFragmentsDir } from "../config.js";` and immediately after it add:
```ts
import type { Selection } from "../schema-model/types.js";
```

(`GraphQLObjectType`, `GraphQLInterfaceType`, `parse`, etc. are already imported in Step 10.3 — do not re-import.)

Then append to `src/services/fragments.ts`:
```ts
/* ------------------------------- load -------------------------------- */

const selectionCache = new Map<string, Selection>(); // key: `${envName}|${name}`

export function clearFragmentCache(): void {
  selectionCache.clear();
}

export interface LoadFragmentInput {
  readonly envName: string;
  readonly name: string;
  readonly schema: GraphQLSchema;
}

async function readFragmentSdl(envName: string, name: string): Promise<string> {
  const path = join(envDir(envName), `${name}.graphql`);
  if (!existsSync(path)) {
    throw new Error(`Fragment "${name}" not found at ${path}.`);
  }
  return readFile(path, "utf-8");
}

function selectionSetToSelection(
  parent: GraphQLObjectType | GraphQLInterfaceType,
  set: SelectionSetNode,
  schema: GraphQLSchema,
  spreads: Map<string, () => Promise<Selection>>
): Selection {
  const fields: Record<string, Selection> = {};

  for (const sel of set.selections) {
    if (sel.kind === "Field") {
      const fieldName = sel.name.value;
      if (fieldName === "__typename") {
        fields[fieldName] = { kind: "scalar" };
        continue;
      }
      const fieldDef = parent.getFields()[fieldName];
      if (!fieldDef) {
        throw new Error(`Field "${fieldName}" missing on "${parent.name}" — schema may have changed; run vex schema refetch.`);
      }
      if (sel.selectionSet) {
        const inner = unwrapNamed(fieldDef.type) as { name?: string };
        const innerType = inner.name ? schema.getType(inner.name) : null;
        if (innerType instanceof GraphQLObjectType || innerType instanceof GraphQLInterfaceType) {
          fields[fieldName] = selectionSetToSelection(innerType, sel.selectionSet, schema, spreads);
        } else {
          throw new Error(`Field "${fieldName}" on "${parent.name}" has no selectable inner type.`);
        }
      } else {
        fields[fieldName] = { kind: "scalar" };
      }
    } else if (sel.kind === "FragmentSpread") {
      const refName = sel.name.value;
      // Use a synthetic key so multiple spreads don't collide.
      const key = `__spread_${refName}`;
      fields[key] = { kind: "fragmentRef", name: refName };
      // Eagerly require the spread to resolve later; record it.
      if (!spreads.has(refName)) {
        spreads.set(refName, async () => {
          throw new Error("placeholder — replaced by loader");
        });
      }
    } else {
      throw new Error(`Inline fragments inside saved fragment files are not supported in v1.`);
    }
  }

  return { kind: "object", fields };
}

/** Loads and parses a fragment, resolving spreads recursively, with cycle detection. */
export async function loadFragment(input: LoadFragmentInput): Promise<Selection> {
  const visiting: string[] = [];
  const cacheKey = `${input.envName}|${input.name}`;

  async function resolve(name: string): Promise<Selection> {
    const k = `${input.envName}|${name}`;
    const cached = selectionCache.get(k);
    if (cached) return cached;
    if (visiting.includes(name)) {
      throw new Error(`Fragment cycle detected: ${[...visiting, name].join(" -> ")}`);
    }
    visiting.push(name);
    try {
      const sdl = await readFragmentSdl(input.envName, name);
      const doc = parse(sdl);
      const def = extractFragmentDef(doc);
      const onType = def.typeCondition.name.value;
      const t = input.schema.getType(onType);
      if (!(t instanceof GraphQLObjectType) && !(t instanceof GraphQLInterfaceType)) {
        throw new Error(`Fragment "${name}" is on "${onType}" which is not an object/interface.`);
      }

      const spreads = new Map<string, () => Promise<Selection>>();
      const sel = selectionSetToSelection(t, def.selectionSet, input.schema, spreads);

      // Resolve all referenced spreads now (recursive — cycle guard handles loops).
      for (const refName of spreads.keys()) {
        await resolve(refName); // throws on cycle / dangling
      }

      selectionCache.set(k, sel);
      return sel;
    } finally {
      visiting.pop();
    }
  }

  const top = await resolve(input.name);
  selectionCache.set(cacheKey, top);
  return top;
}
```

> Note: `loadFragment` returns the raw selection tree with `fragmentRef` nodes intact (not pre-inlined). The caller decides whether to render with `renderDocument({ fragments: [...] })` (deferred fragment expansion at the GraphQL endpoint) or to pre-inline before rendering. The wizard uses the deferred approach.

- [ ] **Step 11.4 — Run tests**

Run `npm test`.
Expected: fragments-load tests pass.

- [ ] **Step 11.5 — Commit**

```
git add src/services/fragments.ts tests/services/fragments-load.test.ts
git commit -m "feat: load fragments to Selection trees with cycle detection"
```

---

## Task 12: Fragment store — delete + getFragmentSdl

**Files:**
- Modify: `src/services/fragments.ts`
- Create: `tests/services/fragments-delete.test.ts`

- [ ] **Step 12.1 — Write failing tests**

Create `tests/services/fragments-delete.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSchemaFromSdl, clearSchemaCache } from "../../src/schema-model/parse.js";
import {
  saveFragment,
  deleteFragment,
  getFragmentSdl,
  setFragmentsRootForTests,
  clearFragmentCache,
} from "../../src/services/fragments.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(__dirname, "../fixtures/schema.graphql"), "utf-8");

let tmp: string;

beforeEach(() => {
  clearSchemaCache();
  tmp = mkdtempSync(join(tmpdir(), "vex-frag-del-"));
  setFragmentsRootForTests(tmp);
  clearFragmentCache();
});

describe("deleteFragment", () => {
  it("removes the file and reports success", async () => {
    const schema = parseSchemaFromSdl("e", fixture);
    await saveFragment({
      envName: "e",
      name: "Z",
      sdl: `fragment Z on Customer { id }`,
      schema,
    });
    expect(existsSync(join(tmp, "e", "Z.graphql"))).toBe(true);
    expect(await deleteFragment({ envName: "e", name: "Z" })).toEqual({ deleted: true });
    expect(existsSync(join(tmp, "e", "Z.graphql"))).toBe(false);
  });

  it("returns deleted: false when the fragment does not exist", async () => {
    expect(await deleteFragment({ envName: "e", name: "Nope" })).toEqual({
      deleted: false,
      reason: "not found",
    });
  });
});

describe("getFragmentSdl", () => {
  it("returns the raw SDL of an existing fragment", async () => {
    const schema = parseSchemaFromSdl("e", fixture);
    const sdl = `fragment Q on Customer { id }`;
    await saveFragment({ envName: "e", name: "Q", sdl, schema });
    expect(await getFragmentSdl({ envName: "e", name: "Q" })).toBe(sdl);
  });

  it("throws when the fragment does not exist", async () => {
    await expect(getFragmentSdl({ envName: "e", name: "Nope" })).rejects.toThrow(/not found/);
  });
});
```

- [ ] **Step 12.2 — Run failing tests**

Run `npm test -- fragments-delete`.
Expected: failures on missing exports.

- [ ] **Step 12.3 — Add `deleteFragment` and `getFragmentSdl`**

Append to `src/services/fragments.ts`:
```ts
/* ------------------------------ delete ------------------------------- */

export interface DeleteFragmentInput {
  readonly envName: string;
  readonly name: string;
}

export async function deleteFragment(input: DeleteFragmentInput): Promise<
  { deleted: true } | { deleted: false; reason: string }
> {
  const path = join(envDir(input.envName), `${input.name}.graphql`);
  if (!existsSync(path)) return { deleted: false, reason: "not found" };
  await unlink(path);
  selectionCache.delete(`${input.envName}|${input.name}`);
  return { deleted: true };
}

/* ------------------------------ getSdl ------------------------------- */

export interface GetFragmentSdlInput {
  readonly envName: string;
  readonly name: string;
}

export async function getFragmentSdl(input: GetFragmentSdlInput): Promise<string> {
  const path = join(envDir(input.envName), `${input.name}.graphql`);
  if (!existsSync(path)) {
    throw new Error(`Fragment "${input.name}" not found at ${path}.`);
  }
  return readFile(path, "utf-8");
}
```

- [ ] **Step 12.4 — Run tests + typecheck**

Run:
```
npm test
npm run typecheck
```

Expected: pass.

- [ ] **Step 12.5 — Commit**

```
git add src/services/fragments.ts tests/services/fragments-delete.test.ts
git commit -m "feat: delete fragments and read raw SDL"
```

---

## Task 13: MCP tool — schema introspection (4 tools)

**Files:**
- Create: `src/services/schema-introspect.ts` (helper functions used by both MCP and any future caller)
- Create: `src/tools/schemaIntrospection.ts`
- Create: `tests/services/schema-introspect.test.ts`

- [ ] **Step 13.1 — Write failing tests**

Create `tests/services/schema-introspect.test.ts`:
```ts
import { describe, it, expect } from "vitest";
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

describe("describeType", () => {
  it("returns SDL for a type and its directly referenced types", () => {
    clearSchemaCache();
    const s = parseSchemaFromSdl("d1", fixture);
    const out = describeType(s, "Customer", 1);
    expect(out).toContain("type Customer");
    expect(out).toContain("type CustomerCustomFields"); // depth 1
    expect(out).toContain("type Address");
  });

  it("excludes built-in scalars", () => {
    clearSchemaCache();
    const s = parseSchemaFromSdl("d2", fixture);
    const out = describeType(s, "Country", 1);
    expect(out).not.toContain("scalar String");
    expect(out).not.toContain("scalar ID");
  });

  it("throws when the type is unknown", () => {
    clearSchemaCache();
    const s = parseSchemaFromSdl("d3", fixture);
    expect(() => describeType(s, "Nope", 1)).toThrow(/Nope/);
  });
});

describe("listCustomFields", () => {
  it("returns custom fields for Customer", () => {
    clearSchemaCache();
    const s = parseSchemaFromSdl("c1", fixture);
    const out = listCustomFields(s, "Customer");
    expect(out.customFields).not.toBeNull();
    expect(out.customFields?.map((f) => f.name).sort()).toEqual(["loyaltyPoints", "vatId"]);
  });

  it("returns null when type has no customFields", () => {
    clearSchemaCache();
    const s = parseSchemaFromSdl("c2", fixture);
    const out = listCustomFields(s, "Country");
    expect(out.customFields).toBeNull();
    expect(out.message).toBeTruthy();
  });
});

describe("listOperations", () => {
  it("lists all queries and mutations by default", () => {
    clearSchemaCache();
    const s = parseSchemaFromSdl("o1", fixture);
    const all = listOperations(s);
    expect(all.find((o) => o.name === "customers")?.kind).toBe("query");
    expect(all.find((o) => o.name === "createCustomer")?.kind).toBe("mutation");
  });

  it("filters by kind and substring", () => {
    clearSchemaCache();
    const s = parseSchemaFromSdl("o2", fixture);
    const onlyQ = listOperations(s, { kind: "query" });
    expect(onlyQ.every((o) => o.kind === "query")).toBe(true);
    const onlyCust = listOperations(s, { search: "cust" });
    expect(onlyCust.every((o) => o.name.toLowerCase().includes("cust"))).toBe(true);
  });
});

describe("describeOperation", () => {
  it("returns SDL for an operation and its referenced types", () => {
    clearSchemaCache();
    const s = parseSchemaFromSdl("op1", fixture);
    const out = describeOperation(s, "customers");
    expect(out).toContain("customers(options: CustomerListOptions): CustomerList!");
    expect(out).toContain("input CustomerListOptions");
    expect(out).toContain("type CustomerList");
  });

  it("throws when the operation does not exist", () => {
    clearSchemaCache();
    const s = parseSchemaFromSdl("op2", fixture);
    expect(() => describeOperation(s, "nope")).toThrow(/nope/i);
  });
});
```

- [ ] **Step 13.2 — Run failing tests**

Run `npm test -- schema-introspect`.
Expected: failures on missing module.

- [ ] **Step 13.3 — Implement `services/schema-introspect.ts`**

Create `src/services/schema-introspect.ts`:
```ts
/**
 * @module services/schema-introspect
 *
 * Schema slicing helpers used by the MCP introspection tools.
 * Stateless; takes a parsed `GraphQLSchema` and returns SDL slices or
 * trimmed metadata.
 */

import {
  printType,
  GraphQLObjectType,
  GraphQLInterfaceType,
  GraphQLInputObjectType,
  GraphQLUnionType,
  GraphQLEnumType,
  GraphQLScalarType,
  GraphQLNonNull,
  GraphQLList,
  type GraphQLSchema,
  type GraphQLNamedType,
  type GraphQLType,
} from "graphql";
import { customFieldsType } from "../schema-model/classify.js";

const BUILTIN = new Set(["String", "Int", "Float", "Boolean", "ID"]);

function unwrap(t: GraphQLType): GraphQLNamedType {
  let cur: GraphQLType = t;
  while (cur instanceof GraphQLNonNull || cur instanceof GraphQLList) {
    cur = cur.ofType;
  }
  return cur as GraphQLNamedType;
}

function gqlTypeStr(t: GraphQLType): string {
  if (t instanceof GraphQLNonNull) return `${gqlTypeStr(t.ofType)}!`;
  if (t instanceof GraphQLList) return `[${gqlTypeStr(t.ofType)}]`;
  return (t as GraphQLNamedType).name;
}

function referencedTypeNames(t: GraphQLNamedType): string[] {
  const names = new Set<string>();
  if (
    t instanceof GraphQLObjectType ||
    t instanceof GraphQLInterfaceType ||
    t instanceof GraphQLInputObjectType
  ) {
    for (const f of Object.values(t.getFields())) {
      const inner = unwrap(f.type);
      names.add(inner.name);
      if ("args" in f && Array.isArray(f.args)) {
        for (const a of f.args) names.add(unwrap(a.type).name);
      }
    }
    if (t instanceof GraphQLObjectType || t instanceof GraphQLInterfaceType) {
      for (const i of t.getInterfaces()) names.add(i.name);
    }
  } else if (t instanceof GraphQLUnionType) {
    for (const m of t.getTypes()) names.add(m.name);
  }
  return [...names];
}

export function describeType(schema: GraphQLSchema, name: string, depth: 1 | 2 = 1): string {
  const root = schema.getType(name);
  if (!root) throw new Error(`Type "${name}" not found in schema.`);
  const visited = new Set<string>();
  const out: string[] = [];

  function visit(t: GraphQLNamedType, currentDepth: number): void {
    if (visited.has(t.name)) return;
    if (BUILTIN.has(t.name)) return;
    visited.add(t.name);
    out.push(printType(t));
    if (currentDepth < depth) {
      for (const refName of referencedTypeNames(t)) {
        const ref = schema.getType(refName);
        if (ref) visit(ref, currentDepth + 1);
      }
    }
  }
  visit(root, 1);
  return out.join("\n\n");
}

export interface CustomFieldInfo {
  readonly name: string;
  readonly type: string;
  readonly nullable: boolean;
  readonly list: boolean;
  readonly description: string | null;
}

export function listCustomFields(
  schema: GraphQLSchema,
  typeName: string
): { customFields: readonly CustomFieldInfo[] | null; message?: string } {
  const t = schema.getType(typeName);
  if (!(t instanceof GraphQLObjectType)) {
    return { customFields: null, message: `Type "${typeName}" is not an object type.` };
  }
  const cf = customFieldsType(t);
  if (!cf) {
    return { customFields: null, message: `Type "${typeName}" has no typed customFields.` };
  }
  const fields: CustomFieldInfo[] = Object.values(cf.getFields()).map((f) => {
    const isNonNull = f.type instanceof GraphQLNonNull;
    const innerOuter = isNonNull ? (f.type as GraphQLNonNull<GraphQLType>).ofType : f.type;
    const isList = innerOuter instanceof GraphQLList;
    const inner = unwrap(f.type);
    return {
      name: f.name,
      type: inner.name,
      nullable: !isNonNull,
      list: isList,
      description: f.description ?? null,
    };
  });
  return { customFields: fields };
}

export interface OperationSummary {
  readonly name: string;
  readonly kind: "query" | "mutation";
  readonly returnType: string;
  readonly args: readonly { name: string; type: string }[];
}

export function listOperations(
  schema: GraphQLSchema,
  opts?: { kind?: "query" | "mutation"; search?: string }
): readonly OperationSummary[] {
  const out: OperationSummary[] = [];
  const wantQ = !opts?.kind || opts.kind === "query";
  const wantM = !opts?.kind || opts.kind === "mutation";
  const needle = opts?.search?.toLowerCase();

  function pushFrom(root: GraphQLObjectType | null | undefined, kind: "query" | "mutation") {
    if (!root) return;
    for (const [name, field] of Object.entries(root.getFields())) {
      if (needle && !name.toLowerCase().includes(needle)) continue;
      out.push({
        name,
        kind,
        returnType: gqlTypeStr(field.type),
        args: field.args.map((a) => ({ name: a.name, type: gqlTypeStr(a.type) })),
      });
    }
  }
  if (wantQ) pushFrom(schema.getQueryType(), "query");
  if (wantM) pushFrom(schema.getMutationType(), "mutation");
  return out;
}

export function describeOperation(schema: GraphQLSchema, name: string): string {
  const q = schema.getQueryType()?.getFields()[name];
  const m = schema.getMutationType()?.getFields()[name];
  const field = q ?? m;
  if (!field) throw new Error(`Operation "${name}" not found.`);
  const kind = q ? "query" : "mutation";

  const argSig = field.args.length
    ? `(${field.args.map((a) => `${a.name}: ${gqlTypeStr(a.type)}`).join(", ")})`
    : "";
  const sigLine = `# ${kind}\n${name}${argSig}: ${gqlTypeStr(field.type)}`;

  const refs = new Set<string>();
  refs.add(unwrap(field.type).name);
  for (const a of field.args) refs.add(unwrap(a.type).name);

  const sliced: string[] = [];
  for (const refName of refs) {
    if (BUILTIN.has(refName)) continue;
    const t = schema.getType(refName);
    if (t) sliced.push(printType(t));
  }
  return `${sigLine}\n\n${sliced.join("\n\n")}`;
}
```

- [ ] **Step 13.4 — Implement the MCP tool group**

Create `src/tools/schemaIntrospection.ts`:
```ts
/** @module tools/schemaIntrospection — MCP tools for slice-based schema discovery. */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getActiveEnv } from "../config.js";
import { loadSchema } from "../schema.js";
import { parseSchemaFromSdl } from "../schema-model/parse.js";
import { jsonContent } from "../output.js";
import {
  describeType,
  listCustomFields,
  listOperations,
  describeOperation,
} from "../services/schema-introspect.js";

async function loadParsedSchema() {
  const { name, env } = await getActiveEnv();
  const sdl = await loadSchema(env, name);
  return parseSchemaFromSdl(name, sdl);
}

export function registerSchemaIntrospectionTools(server: McpServer): void {
  server.tool(
    "vex_describe_type",
    "Return SDL for a type plus SDL for every type it references (depth 1 or 2). Skips built-in scalars.",
    {
      typeName: z.string().describe("Name of the GraphQL type to describe (e.g. 'Customer')."),
      depth: z.union([z.literal(1), z.literal(2)]).optional().describe("Depth of referenced-type expansion. Default 1, max 2."),
    },
    async ({ typeName, depth }) => {
      const schema = await loadParsedSchema();
      const sdl = describeType(schema, typeName, (depth ?? 1) as 1 | 2);
      return { content: [{ type: "text" as const, text: sdl }] };
    }
  );

  server.tool(
    "vex_list_custom_fields",
    "List the custom fields configured on a Vendure entity (e.g. CustomerCustomFields). Returns null when none.",
    {
      typeName: z.string().describe("Entity type name (e.g. 'Customer', 'Product', 'Order')."),
    },
    async ({ typeName }) => {
      const schema = await loadParsedSchema();
      return jsonContent(listCustomFields(schema, typeName));
    }
  );

  server.tool(
    "vex_list_operations",
    "List available top-level queries and mutations, optionally filtered by kind and substring.",
    {
      kind: z.enum(["query", "mutation"]).optional().describe("Filter by operation kind."),
      search: z.string().optional().describe("Case-insensitive substring filter on the operation name."),
    },
    async ({ kind, search }) => {
      const schema = await loadParsedSchema();
      return jsonContent(listOperations(schema, { kind, search }));
    }
  );

  server.tool(
    "vex_describe_operation",
    "Return the SDL signature of one operation, plus SDL for its arg input types and return type.",
    {
      name: z.string().describe("Operation (root field) name (e.g. 'customers', 'createCustomer')."),
    },
    async ({ name }) => {
      const schema = await loadParsedSchema();
      return { content: [{ type: "text" as const, text: describeOperation(schema, name) }] };
    }
  );
}
```

- [ ] **Step 13.5 — Run tests + typecheck**

Run:
```
npm test
npm run typecheck
```

Expected: all schema-introspect tests pass; typecheck clean.

- [ ] **Step 13.6 — Commit**

```
git add src/services/schema-introspect.ts src/tools/schemaIntrospection.ts tests/services/schema-introspect.test.ts
git commit -m "feat: add MCP tools for schema-aware type and operation introspection"
```

---

## Task 14: MCP tools — fragments (list/get/save/delete) + register tool groups

**Files:**
- Create: `src/tools/fragments.ts`
- Modify: `src/mcp.ts`

- [ ] **Step 14.1 — Implement the fragment MCP tools**

Create `src/tools/fragments.ts`:
```ts
/** @module tools/fragments — MCP tools for managing saved GraphQL fragments. */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getActiveEnv } from "../config.js";
import { loadSchema } from "../schema.js";
import { parseSchemaFromSdl } from "../schema-model/parse.js";
import { jsonContent } from "../output.js";
import {
  listFragments,
  getFragmentSdl,
  saveFragment,
  deleteFragment,
} from "../services/fragments.js";

async function loadCtx() {
  const { name, env } = await getActiveEnv();
  const sdl = await loadSchema(env, name);
  return { envName: name, schema: parseSchemaFromSdl(name, sdl) };
}

export function registerFragmentTools(server: McpServer): void {
  server.tool(
    "vex_list_fragments",
    "List saved GraphQL fragments for the active environment, optionally filtered by on-clause type.",
    {
      type: z.string().optional().describe("Filter to fragments whose on-clause matches this type name."),
    },
    async ({ type }) => {
      const { envName } = await loadCtx();
      return jsonContent(await listFragments({ envName, onType: type }));
    }
  );

  server.tool(
    "vex_get_fragment",
    "Return the raw SDL of a saved fragment.",
    {
      name: z.string().describe("Fragment name (CamelCase)."),
    },
    async ({ name }) => {
      const { envName } = await loadCtx();
      const sdl = await getFragmentSdl({ envName, name });
      return { content: [{ type: "text" as const, text: sdl }] };
    }
  );

  server.tool(
    "vex_save_fragment",
    "Persist a GraphQL fragment definition to the active environment's fragment store. Validates against the cached schema.",
    {
      name: z.string().describe("Fragment name (CamelCase). Must match the name in the SDL."),
      sdl: z.string().describe("Full SDL: `fragment Name on Type { ... }`."),
      overwrite: z.boolean().optional().describe("Replace an existing fragment with the same name. Default false."),
    },
    async ({ name, sdl, overwrite }) => {
      const { envName, schema } = await loadCtx();
      const result = await saveFragment({ envName, name, sdl, schema, overwrite });
      return jsonContent(result);
    }
  );

  server.tool(
    "vex_delete_fragment",
    "Delete a saved fragment from the active environment.",
    {
      name: z.string().describe("Fragment name (CamelCase)."),
    },
    async ({ name }) => {
      const { envName } = await loadCtx();
      return jsonContent(await deleteFragment({ envName, name }));
    }
  );
}
```

- [ ] **Step 14.2 — Register both tool groups in `mcp.ts`**

Edit `src/mcp.ts`. Add imports near the existing tool imports:
```ts
import { registerSchemaIntrospectionTools } from "./tools/schemaIntrospection.js";
import { registerFragmentTools } from "./tools/fragments.js";
```

Then in `startMcpServer`, register both **after** `registerChannelTools(server);`:
```ts
registerSchemaIntrospectionTools(server);
registerFragmentTools(server);
```

- [ ] **Step 14.3 — Verify build**

Run:
```
npm run typecheck
npm test
```

Expected: pass.

- [ ] **Step 14.4 — Commit**

```
git add src/tools/fragments.ts src/mcp.ts
git commit -m "feat: register fragment + schema-introspection MCP tool groups"
```

---

## Task 15: CLI — fragment subcommand (list/show/delete)

**Files:**
- Create: `src/commands/fragment.ts`
- Modify: `src/cli.ts`

- [ ] **Step 15.1 — Implement the command**

Create `src/commands/fragment.ts`:
```ts
/** @module commands/fragment — CLI subcommands for managing saved GraphQL fragments. */

import { Command } from "commander";
import { getActiveEnv } from "../config.js";
import {
  listFragments,
  getFragmentSdl,
  deleteFragment,
} from "../services/fragments.js";
import { printTable, printInfo, printSuccess, handleError } from "../output.js";

export function createFragmentCommand(): Command {
  const cmd = new Command("fragment").description("Manage saved GraphQL fragments");

  cmd
    .command("list")
    .description("List saved fragments")
    .option("--type <name>", "Filter by on-clause type name")
    .action(async (opts: { type?: string }) => {
      try {
        const { name } = await getActiveEnv();
        const all = await listFragments({ envName: name, onType: opts.type });
        if (all.length === 0) {
          printInfo("No fragments saved.");
          return;
        }
        printTable(
          ["Name", "On Type", "Fields"],
          all.map((f) => [f.name, f.onType, String(f.fields)])
        );
      } catch (err) {
        handleError(err);
      }
    });

  cmd
    .command("show <name>")
    .description("Print the SDL of a saved fragment")
    .action(async (name: string) => {
      try {
        const { name: envName } = await getActiveEnv();
        const sdl = await getFragmentSdl({ envName, name });
        printInfo(sdl);
      } catch (err) {
        handleError(err);
      }
    });

  cmd
    .command("delete <name>")
    .description("Delete a saved fragment")
    .action(async (name: string) => {
      try {
        const { name: envName } = await getActiveEnv();
        const result = await deleteFragment({ envName, name });
        if (result.deleted) {
          printSuccess(`Fragment "${name}" deleted.`);
        } else {
          printInfo(`Fragment "${name}" not found.`);
        }
      } catch (err) {
        handleError(err);
      }
    });

  return cmd;
}
```

- [ ] **Step 15.2 — Wire the command into `cli.ts`**

Edit `src/cli.ts`. Add import:
```ts
import { createFragmentCommand } from "./commands/fragment.js";
```

After the existing `program.addCommand(createChannelCommand());` line, add:
```ts
program.addCommand(createFragmentCommand());
```

- [ ] **Step 15.3 — Verify build**

Run:
```
npm run typecheck
npm test
npm run build
```

Expected: pass.

- [ ] **Step 15.4 — Commit**

```
git add src/commands/fragment.ts src/cli.ts
git commit -m "feat: add vex fragment list/show/delete CLI subcommand"
```

---

## Task 16: Wizard — pickOperation

**Files:**
- Create: `src/wizard/pickOperation.ts`

- [ ] **Step 16.1 — Implement**

Create `src/wizard/pickOperation.ts`:
```ts
/**
 * @module wizard/pickOperation
 *
 * Step 0 of the wizard. Resolves an operation by name; if missing, runs a
 * text-filter prompt followed by a clack `select` over the filtered ops.
 */

import { text, select, isCancel, cancel } from "@clack/prompts";
import type { GraphQLSchema, GraphQLField } from "graphql";

export interface PickOperationInput {
  readonly schema: GraphQLSchema;
  readonly kind: "query" | "mutation";
  readonly nameHint?: string;
}

export interface PickOperationResult {
  readonly name: string;
  readonly field: GraphQLField<unknown, unknown>;
}

function rootFor(schema: GraphQLSchema, kind: "query" | "mutation") {
  return kind === "query" ? schema.getQueryType() : schema.getMutationType();
}

function suggest(name: string, candidates: readonly string[]): string[] {
  // Levenshtein, top 5
  function ld(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
      }
    }
    return dp[m][n];
  }
  return [...candidates].sort((x, y) => ld(name, x) - ld(name, y)).slice(0, 5);
}

export async function pickOperation(input: PickOperationInput): Promise<PickOperationResult> {
  const root = rootFor(input.schema, input.kind);
  if (!root) throw new Error(`Schema has no ${input.kind} root type.`);
  const all = Object.entries(root.getFields());
  const allNames = all.map(([n]) => n);

  if (input.nameHint) {
    const found = root.getFields()[input.nameHint];
    if (found) return { name: input.nameHint, field: found };
    const close = suggest(input.nameHint, allNames).join(", ");
    throw new Error(`No ${input.kind} named "${input.nameHint}". Did you mean: ${close}?`);
  }

  const filterRaw = await text({
    message: `Filter ${input.kind} operations (empty for all):`,
    placeholder: "e.g. cust",
  });
  if (isCancel(filterRaw)) {
    cancel("Cancelled. No request sent.");
    process.exit(130);
  }
  const filter = String(filterRaw ?? "").toLowerCase();

  const filtered = all
    .filter(([n]) => !filter || n.toLowerCase().includes(filter))
    .map(([n]) => ({ value: n, label: n }));

  if (filtered.length === 0) {
    throw new Error(`No ${input.kind} operations match "${filter}".`);
  }

  const picked = await select({
    message: `Select a ${input.kind}:`,
    options: filtered,
    maxItems: 12,
  });
  if (isCancel(picked)) {
    cancel("Cancelled. No request sent.");
    process.exit(130);
  }
  const name = String(picked);
  return { name, field: root.getFields()[name] };
}
```

- [ ] **Step 16.2 — Verify build**

Run `npm run typecheck`.
Expected: pass.

- [ ] **Step 16.3 — Commit**

```
git add src/wizard/pickOperation.ts
git commit -m "feat: wizard step 0 — pickOperation with text filter and clack select"
```

---

## Task 17: Wizard — promptVariables (scalars + ListOptions sub-flow)

**Files:**
- Create: `src/wizard/promptVariables.ts`

- [ ] **Step 17.1 — Implement**

Create `src/wizard/promptVariables.ts`:
```ts
/**
 * @module wizard/promptVariables
 *
 * Step 1 of the wizard: prompt for each operation argument.
 * For *ListOptions inputs, run a structured take/skip/sort/filter sub-flow.
 * For other args, prompt by scalar/enum/JSON type.
 */

import { text, select, confirm, isCancel, cancel, multiselect } from "@clack/prompts";
import {
  GraphQLNonNull,
  GraphQLList,
  GraphQLScalarType,
  GraphQLEnumType,
  GraphQLInputObjectType,
  type GraphQLArgument,
  type GraphQLSchema,
  type GraphQLInputType,
  type GraphQLNamedType,
} from "graphql";
import { isListOptionsInput } from "../schema-model/classify.js";
import { DEFAULT_PAGE_SIZE, DEFAULT_SKIP } from "../constants.js";

function bail(): never {
  cancel("Cancelled. No request sent.");
  process.exit(130);
}
function unwrap(t: GraphQLInputType): GraphQLNamedType {
  let cur: GraphQLInputType = t;
  while (cur instanceof GraphQLNonNull || cur instanceof GraphQLList) {
    cur = cur.ofType as GraphQLInputType;
  }
  return cur as unknown as GraphQLNamedType;
}
function isRequired(t: GraphQLInputType): boolean {
  return t instanceof GraphQLNonNull;
}

async function promptScalar(name: string, typeName: string, required: boolean): Promise<unknown> {
  if (typeName === "Boolean") {
    const v = await confirm({ message: `${name} (Boolean${required ? "" : ", optional"}):` });
    if (isCancel(v)) bail();
    return v;
  }
  const v = await text({
    message: `${name} (${typeName}${required ? "" : ", optional — leave empty to skip"}):`,
  });
  if (isCancel(v)) bail();
  const raw = String(v ?? "");
  if (raw === "" && !required) return undefined;
  if (typeName === "Int" || typeName === "Float") {
    const n = Number(raw);
    if (Number.isNaN(n)) throw new Error(`Invalid number for ${name}: "${raw}"`);
    return n;
  }
  return raw;
}

async function promptEnum(name: string, t: GraphQLEnumType, required: boolean): Promise<unknown> {
  const opts = t.getValues().map((v) => ({ value: v.name, label: v.name }));
  if (!required) opts.push({ value: "__skip__", label: "(skip)" });
  const v = await select({ message: `${name} (${t.name}):`, options: opts });
  if (isCancel(v)) bail();
  if (v === "__skip__") return undefined;
  return String(v);
}

async function promptJsonInput(name: string, typeName: string, required: boolean): Promise<unknown> {
  while (true) {
    const v = await text({
      message: `${name} (${typeName} as JSON${required ? "" : ", empty to skip"}):`,
      placeholder: "{}",
    });
    if (isCancel(v)) bail();
    const raw = String(v ?? "");
    if (raw === "" && !required) return undefined;
    try {
      return JSON.parse(raw);
    } catch (err) {
      console.error(`Invalid JSON: ${(err as Error).message}. Try again.`);
    }
  }
}

/* --------------------------- ListOptions flow --------------------------- */

async function promptListOptions(
  argName: string,
  optionsType: GraphQLInputObjectType,
  schema: GraphQLSchema
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};

  const takeRaw = await text({ message: "How many items? (take)", placeholder: String(DEFAULT_PAGE_SIZE) });
  if (isCancel(takeRaw)) bail();
  out.take = Number(String(takeRaw ?? "") || DEFAULT_PAGE_SIZE);

  const skipRaw = await text({ message: "Skip how many? (skip)", placeholder: String(DEFAULT_SKIP) });
  if (isCancel(skipRaw)) bail();
  out.skip = Number(String(skipRaw ?? "") || DEFAULT_SKIP);

  const sortField = optionsType.getFields().sort?.type;
  if (sortField) {
    const sortType = unwrap(sortField as GraphQLInputType);
    if (sortType instanceof GraphQLInputObjectType) {
      const fieldNames = Object.keys(sortType.getFields());
      const picked = await multiselect({
        message: "Sort by which fields? (none = no sort)",
        required: false,
        options: fieldNames.map((n) => ({ value: n, label: n })),
      });
      if (isCancel(picked)) bail();
      const arr = (picked as readonly string[]) ?? [];
      if (arr.length > 0) {
        const sortObj: Record<string, string> = {};
        for (const f of arr) {
          const dir = await select({
            message: `Direction for "${f}":`,
            options: [
              { value: "ASC", label: "ASC" },
              { value: "DESC", label: "DESC" },
            ],
          });
          if (isCancel(dir)) bail();
          sortObj[f] = String(dir);
        }
        out.sort = sortObj;
      }
    }
  }

  const filterField = optionsType.getFields().filter?.type;
  if (filterField) {
    const addAny = await confirm({ message: "Add filter conditions?", initialValue: false });
    if (isCancel(addAny)) bail();
    if (addAny) {
      const filterType = unwrap(filterField as GraphQLInputType);
      if (filterType instanceof GraphQLInputObjectType) {
        const filterObj: Record<string, unknown> = {};
        let more = true;
        while (more) {
          const fieldName = await select({
            message: "Filter field:",
            options: Object.keys(filterType.getFields()).map((n) => ({ value: n, label: n })),
          });
          if (isCancel(fieldName)) bail();
          const opType = unwrap(filterType.getFields()[String(fieldName)].type);
          if (!(opType instanceof GraphQLInputObjectType)) {
            throw new Error(`Filter field "${String(fieldName)}" has unsupported type ${opType.name}.`);
          }
          const opName = await select({
            message: "Operator:",
            options: Object.keys(opType.getFields()).map((n) => ({ value: n, label: n })),
          });
          if (isCancel(opName)) bail();
          const valRaw = await text({ message: `Value for ${String(fieldName)} ${String(opName)}:` });
          if (isCancel(valRaw)) bail();
          filterObj[String(fieldName)] = { [String(opName)]: String(valRaw ?? "") };

          const cont = await confirm({ message: "Add another filter?", initialValue: false });
          if (isCancel(cont)) bail();
          more = Boolean(cont);
        }
        out.filter = filterObj;
      }
    }
  }

  return out;
}

/* --------------------------- entry point --------------------------- */

export async function promptVariables(
  args: readonly GraphQLArgument[],
  schema: GraphQLSchema
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const a of args) {
    const required = isRequired(a.type);
    const inner = unwrap(a.type);

    if (isListOptionsInput(inner)) {
      out[a.name] = await promptListOptions(a.name, inner as GraphQLInputObjectType, schema);
      continue;
    }

    if (inner instanceof GraphQLScalarType) {
      const v = await promptScalar(a.name, inner.name, required);
      if (v !== undefined) out[a.name] = v;
    } else if (inner instanceof GraphQLEnumType) {
      const v = await promptEnum(a.name, inner, required);
      if (v !== undefined) out[a.name] = v;
    } else if (inner instanceof GraphQLInputObjectType) {
      const v = await promptJsonInput(a.name, inner.name, required);
      if (v !== undefined) out[a.name] = v;
    } else {
      const v = await promptJsonInput(a.name, inner.name, required);
      if (v !== undefined) out[a.name] = v;
    }
  }
  return out;
}
```

- [ ] **Step 17.2 — Verify build**

Run `npm run typecheck`.
Expected: pass.

- [ ] **Step 17.3 — Commit**

```
git add src/wizard/promptVariables.ts
git commit -m "feat: wizard step 1 — variable prompts with structured ListOptions sub-flow"
```

---

## Task 18: Wizard — pickPreset

**Files:**
- Create: `src/wizard/pickPreset.ts`

- [ ] **Step 18.1 — Implement**

Create `src/wizard/pickPreset.ts`:
```ts
/**
 * @module wizard/pickPreset
 *
 * Step 2 of the wizard: select-set preset menu.
 * Returns a tag the orchestrator uses to route to the next step.
 */

import { select, isCancel, cancel } from "@clack/prompts";
import type { FragmentMeta } from "../services/fragments.js";

export type PresetChoice =
  | { kind: "fragment"; name: string }
  | { kind: "allScalars" }
  | { kind: "allScalarsPlusOne" }
  | { kind: "customize" }
  | { kind: "paste" };

export interface PickPresetInput {
  readonly typeName: string;
  readonly fragments: readonly FragmentMeta[]; // already filtered to this type
}

export async function pickPreset(input: PickPresetInput): Promise<PresetChoice> {
  type Opt = { value: string; label: string };
  const options: Opt[] = [];
  for (const f of input.fragments) {
    options.push({ value: `frag:${f.name}`, label: `Fragment: ${f.name} (${f.fields} fields)` });
  }
  options.push(
    { value: "allScalars", label: "All scalars (recommended)" },
    { value: "allScalarsPlusOne", label: "All scalars + 1 level deep" },
    { value: "customize", label: "Customize (flat path selector)" },
    { value: "paste", label: "Paste GraphQL selection set" }
  );

  const picked = await select({ message: `Selection on ${input.typeName}:`, options, maxItems: 12 });
  if (isCancel(picked)) {
    cancel("Cancelled. No request sent.");
    process.exit(130);
  }
  const v = String(picked);
  if (v.startsWith("frag:")) return { kind: "fragment", name: v.slice("frag:".length) };
  switch (v) {
    case "allScalars":
      return { kind: "allScalars" };
    case "allScalarsPlusOne":
      return { kind: "allScalarsPlusOne" };
    case "customize":
      return { kind: "customize" };
    case "paste":
      return { kind: "paste" };
    default:
      throw new Error(`Unexpected preset value: ${v}`);
  }
}
```

- [ ] **Step 18.2 — Verify build**

Run `npm run typecheck`.
Expected: pass.

- [ ] **Step 18.3 — Commit**

```
git add src/wizard/pickPreset.ts
git commit -m "feat: wizard step 2 — preset menu (fragments / scalars / customize / paste)"
```

---

## Task 19: Wizard — pickFields (flat path multi-select)

**Files:**
- Create: `src/wizard/pickFields.ts`

- [ ] **Step 19.1 — Implement**

Create `src/wizard/pickFields.ts`:
```ts
/**
 * @module wizard/pickFields
 *
 * Step 3 of the wizard (Customize path). Flat multi-select over every
 * reachable leaf path up to the configured max depth.
 */

import { multiselect, isCancel, cancel } from "@clack/prompts";
import { GraphQLObjectType } from "graphql";
import { reachableLeafPaths } from "../schema-model/walk.js";
import type { Selection } from "../schema-model/types.js";

export interface PickFieldsInput {
  readonly type: GraphQLObjectType;
  readonly maxDepth: number;
}

function pathsToSelection(paths: readonly string[]): Selection {
  // Build a nested object Selection from dotted paths.
  const root: Record<string, unknown> = {};
  for (const p of paths) {
    const parts = p.split(".");
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
      const key = parts[i];
      if (i === parts.length - 1) {
        cur[key] = { kind: "scalar" } satisfies Selection;
      } else {
        const next = (cur[key] as { fields?: Record<string, unknown> } | undefined)?.fields ?? {};
        cur[key] = { kind: "object", fields: next } satisfies Selection;
        cur = next;
      }
    }
  }
  return { kind: "object", fields: root as Record<string, Selection> };
}

export async function pickFields(input: PickFieldsInput): Promise<Selection> {
  const all = reachableLeafPaths(input.type, { maxDepth: input.maxDepth });
  if (all.length === 0) {
    throw new Error(`No selectable fields under "${input.type.name}".`);
  }
  const picked = await multiselect({
    message: `Pick fields (depth ≤ ${input.maxDepth}):`,
    required: true,
    options: all.map((p) => ({ value: p.path, label: `${p.path} (${p.typeName})` })),
  });
  if (isCancel(picked)) {
    cancel("Cancelled. No request sent.");
    process.exit(130);
  }
  return pathsToSelection(picked as readonly string[]);
}
```

- [ ] **Step 19.2 — Verify build**

Run `npm run typecheck`.
Expected: pass.

- [ ] **Step 19.3 — Commit**

```
git add src/wizard/pickFields.ts
git commit -m "feat: wizard step 3 — flat path multi-select selector"
```

---

## Task 20: Wizard — saveFragment prompt

**Files:**
- Create: `src/wizard/saveFragment.ts`

- [ ] **Step 20.1 — Implement**

Create `src/wizard/saveFragment.ts`:
```ts
/**
 * @module wizard/saveFragment
 *
 * Step 4 of the wizard (post-Customize). Optionally persists the built
 * Selection as a fragment file.
 */

import { confirm, text, isCancel, cancel } from "@clack/prompts";
import { renderDocument } from "../schema-model/render.js";
import type { Selection } from "../schema-model/types.js";
import type { GraphQLSchema } from "graphql";
import { saveFragment } from "../services/fragments.js";

const NAME_RE = /^[A-Za-z][A-Za-z0-9]*$/;

export interface MaybeSaveFragmentInput {
  readonly envName: string;
  readonly typeName: string;
  readonly selection: Selection;
  readonly schema: GraphQLSchema;
}

function buildFragmentSdl(name: string, onType: string, selection: Selection): string {
  const doc = renderDocument({
    kind: "query",
    name: "_Synth",
    operationField: "_synth",
    operationArgs: [],
    variables: {},
    selection,
  });
  // Extract just the inner selection-set body (between the operation field's "{" and matching "}").
  // Then wrap with `fragment Name on Type { body }`.
  const match = doc.query.match(/_synth\s*\{([\s\S]*)\n\s*\}\s*\n\}/);
  const body = match ? match[1].trim() : "";
  return `fragment ${name} on ${onType} {\n  ${body.replace(/\n/g, "\n  ")}\n}\n`;
}

export async function maybeSaveFragment(input: MaybeSaveFragmentInput): Promise<void> {
  const yes = await confirm({ message: "Save this selection as a fragment?", initialValue: false });
  if (isCancel(yes)) {
    cancel("Cancelled. No request sent.");
    process.exit(130);
  }
  if (!yes) return;

  let name = "";
  while (true) {
    const raw = await text({
      message: "Fragment name (CamelCase):",
      placeholder: `${input.typeName}Custom`,
      defaultValue: `${input.typeName}Custom`,
    });
    if (isCancel(raw)) {
      cancel("Cancelled. No request sent.");
      process.exit(130);
    }
    name = String(raw ?? "");
    if (NAME_RE.test(name)) break;
    console.error(`Invalid name "${name}". Use CamelCase letters/digits, starting with a letter.`);
  }

  const sdl = buildFragmentSdl(name, input.typeName, input.selection);
  try {
    await saveFragment({ envName: input.envName, name, sdl, schema: input.schema });
    console.log(`Saved fragment ${name}.`);
  } catch (err) {
    if ((err as Error).message.match(/already exists/i)) {
      const ow = await confirm({ message: `Overwrite existing "${name}"?`, initialValue: false });
      if (isCancel(ow) || !ow) {
        console.log("Skipped saving.");
        return;
      }
      await saveFragment({ envName: input.envName, name, sdl, schema: input.schema, overwrite: true });
      console.log(`Overwrote fragment ${name}.`);
    } else {
      throw err;
    }
  }
}
```

- [ ] **Step 20.2 — Verify build**

Run `npm run typecheck`.
Expected: pass.

- [ ] **Step 20.3 — Commit**

```
git add src/wizard/saveFragment.ts
git commit -m "feat: wizard step 4 — optionally save selection as a fragment"
```

---

## Task 21: Wizard — orchestrator (run.ts)

**Files:**
- Create: `src/wizard/run.ts`

- [ ] **Step 21.1 — Implement**

Create `src/wizard/run.ts`:
```ts
/**
 * @module wizard/run
 *
 * Orchestrates the full wizard: pick op → variables → preset → maybe customize →
 * maybe save → render & execute.
 */

import { intro, outro, text, isCancel, cancel, log } from "@clack/prompts";
import {
  GraphQLObjectType,
  GraphQLUnionType,
  GraphQLNonNull,
  GraphQLList,
  parse,
  type GraphQLSchema,
  type GraphQLNamedType,
  type GraphQLOutputType,
} from "graphql";
import { getActiveEnv } from "../config.js";
import { loadSchema, refetchSchema } from "../schema.js";
import { parseSchemaFromSdl } from "../schema-model/parse.js";
import { reachableLeafPaths } from "../schema-model/walk.js";
import {
  isPaginatedList,
  paginatedItemType,
  errorBranches,
  successBranches,
} from "../schema-model/classify.js";
import { listFragments, loadFragment, getFragmentSdl } from "../services/fragments.js";
import { buildAndExecute, buildDocument } from "../services/builder.js";
import type { Selection } from "../schema-model/types.js";
import { DEFAULT_SELECTOR_MAX_DEPTH, MAX_SELECTOR_DEPTH } from "../constants.js";
import { pickOperation } from "./pickOperation.js";
import { promptVariables } from "./promptVariables.js";
import { pickPreset, type PresetChoice } from "./pickPreset.js";
import { pickFields } from "./pickFields.js";
import { maybeSaveFragment } from "./saveFragment.js";

export interface RunWizardInput {
  readonly kind: "query" | "mutation";
  readonly operationName?: string;
  readonly fragmentName?: string;
  readonly maxDepth?: number;
  readonly dryRun?: boolean;
  readonly quiet?: boolean;
}

function unwrapNamed(t: GraphQLOutputType): GraphQLNamedType {
  let cur: GraphQLOutputType = t;
  while (cur instanceof GraphQLNonNull || cur instanceof GraphQLList) {
    cur = cur.ofType as GraphQLOutputType;
  }
  return cur as unknown as GraphQLNamedType;
}

function bail(): never {
  cancel("Cancelled. No request sent.");
  process.exit(130);
}

function ensureTty(): void {
  if (!process.stdout.isTTY) {
    throw new Error(
      "Wizard requires a TTY. Pipe-friendly mode: use `--fragment <Name>` plus variable flags."
    );
  }
}

function selectionFromPaths(typeForWalk: GraphQLObjectType, depth: number): Selection {
  const paths = reachableLeafPaths(typeForWalk, { maxDepth: depth }).map((p) => p.path);
  const root: Record<string, Selection> = {};
  function set(path: string[], obj: Record<string, Selection>): void {
    const [head, ...rest] = path;
    if (rest.length === 0) {
      obj[head] = { kind: "scalar" };
      return;
    }
    const child = (obj[head] as { kind: "object"; fields: Record<string, Selection> } | undefined)
      ?? { kind: "object", fields: {} };
    obj[head] = child;
    set(rest, (child as { fields: Record<string, Selection> }).fields);
  }
  for (const p of paths) set(p.split("."), root);
  return { kind: "object", fields: root };
}

async function ensureSchema(): Promise<{ envName: string; schema: GraphQLSchema }> {
  const { name, env } = await getActiveEnv();
  let sdl: string;
  try {
    sdl = await loadSchema(env, name);
  } catch (err) {
    log.warn(`No cached schema. Fetching now…`);
    sdl = await refetchSchema(env, name);
  }
  return { envName: name, schema: parseSchemaFromSdl(name, sdl) };
}

function paginatedReturn(returnType: GraphQLNamedType): {
  itemType: GraphQLObjectType;
  totalItemsAuto: true;
} | null {
  if (!isPaginatedList(returnType)) return null;
  const item = paginatedItemType(returnType);
  if (!(item instanceof GraphQLObjectType)) return null;
  return { itemType: item, totalItemsAuto: true };
}

async function selectionForType(
  schemaCtx: { envName: string; schema: GraphQLSchema },
  type: GraphQLObjectType,
  fragmentNameOverride: string | undefined,
  maxDepth: number,
  presetForceFragment: PresetChoice | undefined
): Promise<{ selection: Selection; fragmentDefinitions: { name: string; sdl: string }[]; usedFragment: boolean }> {
  const fragmentDefinitions: { name: string; sdl: string }[] = [];

  if (fragmentNameOverride) {
    const fragSdl = await getFragmentSdl({ envName: schemaCtx.envName, name: fragmentNameOverride });
    const sel: Selection = { kind: "object", fields: { __ref: { kind: "fragmentRef", name: fragmentNameOverride } } };
    fragmentDefinitions.push({ name: fragmentNameOverride, sdl: fragSdl });
    return { selection: sel, fragmentDefinitions, usedFragment: true };
  }

  const fragments = await listFragments({ envName: schemaCtx.envName, onType: type.name });
  const choice = presetForceFragment ?? (await pickPreset({ typeName: type.name, fragments }));

  if (choice.kind === "fragment") {
    const fragSdl = await getFragmentSdl({ envName: schemaCtx.envName, name: choice.name });
    fragmentDefinitions.push({ name: choice.name, sdl: fragSdl });
    return {
      selection: { kind: "object", fields: { __ref: { kind: "fragmentRef", name: choice.name } } },
      fragmentDefinitions,
      usedFragment: true,
    };
  }
  if (choice.kind === "allScalars") {
    return { selection: selectionFromPaths(type, 1), fragmentDefinitions, usedFragment: false };
  }
  if (choice.kind === "allScalarsPlusOne") {
    return { selection: selectionFromPaths(type, 2), fragmentDefinitions, usedFragment: false };
  }
  if (choice.kind === "customize") {
    const sel = await pickFields({ type, maxDepth });
    await maybeSaveFragment({ envName: schemaCtx.envName, typeName: type.name, selection: sel, schema: schemaCtx.schema });
    return { selection: sel, fragmentDefinitions, usedFragment: false };
  }
  // paste
  const raw = await text({
    message: "Paste a GraphQL selection set, e.g. `{ id firstName }`:",
    placeholder: "{ id firstName }",
  });
  if (isCancel(raw)) bail();
  const sdl = `query _S { _f ${String(raw ?? "")} }`;
  parse(sdl); // validate syntax (throws on parse error)
  // Build a Selection from a parsed paste is non-trivial; fall back to inlining as a raw fragment
  // by wrapping into a fragment with a synthetic name and using a fragmentRef.
  const synthName = `__Paste_${Date.now()}`;
  fragmentDefinitions.push({
    name: synthName,
    sdl: `fragment ${synthName} on ${type.name} ${String(raw ?? "")}`,
  });
  return {
    selection: { kind: "object", fields: { __ref: { kind: "fragmentRef", name: synthName } } },
    fragmentDefinitions,
    usedFragment: true,
  };
}

export async function runWizard(input: RunWizardInput): Promise<void> {
  ensureTty();
  const ctx = await ensureSchema();

  intro(`vex builder — ${input.kind}`);

  // Step 0: pick operation
  const op = await pickOperation({
    schema: ctx.schema,
    kind: input.kind,
    nameHint: input.operationName,
  });

  // Step 1: variables
  const variables = await promptVariables(op.field.args, ctx.schema);

  // Step 2 prep: classify return type
  const returnNamed = unwrapNamed(op.field.type);

  let selection: Selection;
  const fragmentDefinitions: { name: string; sdl: string }[] = [];

  const maxDepth = Math.min(input.maxDepth ?? DEFAULT_SELECTOR_MAX_DEPTH, MAX_SELECTOR_DEPTH);

  if (returnNamed instanceof GraphQLUnionType) {
    // ErrorResult union path
    const errBr = errorBranches(returnNamed);
    const okBr = successBranches(returnNamed);
    const branches: Record<string, Selection> = {};
    for (const ok of okBr) {
      // Edge case (spec §7): a "Success" branch with no scalar fields renders as `{ __typename }`.
      const hasSelectableFields = reachableLeafPaths(ok, { maxDepth: 1 }).length > 0;
      if (!hasSelectableFields) {
        branches[ok.name] = { kind: "object", fields: { __typename: { kind: "scalar" } } };
        continue;
      }
      const sub = await selectionForType(ctx, ok, input.fragmentName, maxDepth, undefined);
      branches[ok.name] = sub.selection;
      fragmentDefinitions.push(...sub.fragmentDefinitions);
    }
    for (const e of errBr) {
      branches[e.name] = {
        kind: "object",
        fields: { errorCode: { kind: "scalar" }, message: { kind: "scalar" } },
      };
    }
    selection = { kind: "union", branches, includeTypename: true };
  } else {
    const paginated = returnNamed instanceof GraphQLObjectType ? paginatedReturn(returnNamed) : null;
    if (paginated) {
      // wrap items + totalItems
      const itemSel = await selectionForType(ctx, paginated.itemType, input.fragmentName, maxDepth, undefined);
      fragmentDefinitions.push(...itemSel.fragmentDefinitions);
      selection = {
        kind: "object",
        fields: {
          items: itemSel.selection,
          totalItems: { kind: "scalar" },
        },
      };
    } else if (returnNamed instanceof GraphQLObjectType) {
      const sub = await selectionForType(ctx, returnNamed, input.fragmentName, maxDepth, undefined);
      selection = sub.selection;
      fragmentDefinitions.push(...sub.fragmentDefinitions);
    } else {
      throw new Error(`Return type "${returnNamed.name}" is not selectable in v1.`);
    }
  }

  // Step 5: render & execute
  const built = buildDocument({
    schema: ctx.schema,
    kind: input.kind,
    operationName: op.name,
    variables,
    selection,
    fragments: fragmentDefinitions,
  });

  if (!input.quiet) {
    log.message("--- GraphQL ---");
    console.log(built.query);
    log.message("--- Variables ---");
    console.log(JSON.stringify(built.variables, null, 2));
  }

  if (input.dryRun) {
    outro("Dry run — no request sent.");
    return;
  }

  const data = await buildAndExecute({
    schema: ctx.schema,
    kind: input.kind,
    operationName: op.name,
    variables,
    selection,
    fragments: fragmentDefinitions,
  });
  log.message("--- Response ---");
  console.log(JSON.stringify(data, null, 2));
  outro("Done.");
}
```

- [ ] **Step 21.2 — Verify build**

Run:
```
npm run typecheck
npm test
```

Expected: pass.

- [ ] **Step 21.3 — Commit**

```
git add src/wizard/run.ts
git commit -m "feat: wizard orchestrator wires steps 0-5 with paginated/union handling"
```

---

## Task 22: CLI — `build` command + `-q` / `-m` short flags

**Files:**
- Create: `src/commands/build.ts`
- Modify: `src/cli.ts`

- [ ] **Step 22.1 — Implement the `build` command**

Create `src/commands/build.ts`:
```ts
/** @module commands/build — CLI entry to the GraphQL operation builder wizard. */

import { Command } from "commander";
import { runWizard } from "../wizard/run.js";
import { handleError } from "../output.js";

export function createBuildCommand(): Command {
  const cmd = new Command("build")
    .description("Interactively build and execute a GraphQL operation")
    .option("-q, --query [name]", "Build a query (optionally pre-selected by name)")
    .option("-m, --mutation [name]", "Build a mutation (optionally pre-selected by name)")
    .option("--fragment <name>", "Use a saved fragment for field selection (skips selector)")
    .option("--max-depth <n>", "Override the flat-path selector max depth", (v) => Number(v))
    .option("--dry-run", "Print the constructed GraphQL document and exit without executing")
    .option("--quiet", "Skip the GraphQL preview, just print the response")
    .action(async (opts) => {
      try {
        const isQuery = opts.query !== undefined;
        const isMutation = opts.mutation !== undefined;
        if (isQuery && isMutation) {
          throw new Error("Pass either -q or -m, not both.");
        }
        if (!isQuery && !isMutation) {
          throw new Error("Specify -q (query) or -m (mutation).");
        }
        const kind: "query" | "mutation" = isQuery ? "query" : "mutation";
        const operationName =
          (isQuery && typeof opts.query === "string" ? opts.query : undefined) ||
          (isMutation && typeof opts.mutation === "string" ? opts.mutation : undefined);

        await runWizard({
          kind,
          operationName,
          fragmentName: opts.fragment,
          maxDepth: opts.maxDepth,
          dryRun: Boolean(opts.dryRun),
          quiet: Boolean(opts.quiet),
        });
      } catch (err) {
        handleError(err);
      }
    });

  return cmd;
}
```

- [ ] **Step 22.2 — Wire into `cli.ts`**

Edit `src/cli.ts`. Add import:
```ts
import { createBuildCommand } from "./commands/build.js";
```

After the `program.addCommand(createFragmentCommand());` line from Task 15, add:
```ts
program.addCommand(createBuildCommand());
```

> Note: Commander does not natively support top-level short flags like `vex -q customers` that route to a subcommand. The `build` command's own `-q` / `-m` flags are the canonical entry point. Use `vex build -q customers`. The spec's "vex -q OperationName" form is achieved through this subcommand. Document this in the README in Task 23.

- [ ] **Step 22.3 — Verify end-to-end build**

Run:
```
npm run typecheck
npm run lint
npm test
npm run build
```

Expected: all pass; `dist/` rebuilt.

- [ ] **Step 22.4 — Commit**

```
git add src/commands/build.ts src/cli.ts
git commit -m "feat: add vex build command with -q/-m, --fragment, --dry-run, --quiet flags"
```

---

## Task 23: Final verification + manual smoke test doc

**Files:**
- Create: `docs/superpowers/manual-smoke-test.md`

- [ ] **Step 23.1 — Run full verification**

Run, in order:
```
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: every command exits zero. If lint reports issues only in new files, fix them. Lint issues in files this plan did not touch are out of scope and should be ignored.

- [ ] **Step 23.2 — Confirm coverage threshold**

Run:
```
npm run test:coverage
```

Expected: coverage ≥ 80% on `src/schema-model/**`, `src/services/builder.ts`, `src/services/fragments.ts`. If a file is below threshold, add a focused test (do not lower the threshold).

- [ ] **Step 23.3 — Write the manual smoke test doc**

Create `docs/superpowers/manual-smoke-test.md`:
```markdown
# Manual smoke test — GraphQL builder wizard

The wizard layer is excluded from automated tests. Run these manual checks
against a real Vendure environment after any change to `src/wizard/`.

## Setup

```
vex env add staging --url https://staging.example.com/admin-api --api-key XXX --fetch-schema
```

## Scenario 1 — Paginated query, all scalars

```
vex build -q customers
```

Expect:
- Prompt for take/skip/sort/filter.
- Preset menu lists "All scalars (recommended)" first.
- Constructed document includes `items { ... }` and `totalItems`.
- Response JSON printed.

## Scenario 2 — Mutation with ErrorResult union

```
vex build -m createCustomer
```

Expect:
- Prompts for the input.
- Selection menu opens for the success branch only.
- Document includes `... on Customer { ... } ... on EmailAddressConflictError { __typename errorCode message } __typename`.

## Scenario 3 — Custom fields via Customize

```
vex build -q customer
```

Expect:
- Prompts for `id`.
- Selection preset menu, choose Customize.
- Path list includes `customFields.<your custom field>` paths if your Vendure has them.
- After picking, prompt to save as fragment.
- Saved fragment appears at `~/.vendure-vex/fragments/staging/<Name>.graphql`.

## Scenario 4 — Reuse a saved fragment

```
vex build -q customers --fragment CustomerBasic --dry-run
```

Expect:
- Document references `...CustomerBasic` and includes the fragment definition appended.
- Exits without sending the request.

## Scenario 5 — Cancel mid-wizard

Start `vex build -q customers` and press Ctrl+C at any prompt.

Expect: "Cancelled. No request sent." and exit code 130.
```

- [ ] **Step 23.4 — Commit**

```
git add docs/superpowers/manual-smoke-test.md
git commit -m "docs: manual smoke test scenarios for the wizard"
```

---

## Done

The plan ends here. The wizard layer's own flow has been built incrementally through Tasks 16–22 and verified end-to-end in Task 23. Ship.

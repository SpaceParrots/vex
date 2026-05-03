# GraphQL Operation Builder + MCP Schema Introspection — Design

**Date:** 2026-05-04
**Status:** Design approved, awaiting implementation plan

## 1. Goal

Add a generic, schema-driven GraphQL operation builder to Vex with two distinct surfaces:

1. **CLI wizard** (`vex -q OperationName` / `vex -m OperationName`) that walks a user through variable input and field selection for any query or mutation in the cached schema, applying Vendure-aware shortcuts (PaginatedList, ListOptions, ErrorResult unions, customFields), and lets them save selections as named GraphQL fragments for reuse.
2. **MCP schema-introspection tools** that let an agent discover types, custom fields, operations, and saved fragments — agents then send the actual query through the existing raw `vex_query` / `vex_mutate`. No new structured-builder DSL for MCP in v1.

The motivation is custom fields: every Vendure instance extends the Admin API with custom fields and custom types, and Vex's hand-written typed services cannot cover them. The builder fills that gap.

## 2. Non-goals (v1)

- Replacing the existing typed entity tools (`customers`, `products`, `orders`, `zones`, `tax`, `channels`). They remain as fast, opinionated quick-utils for the common path.
- A structured builder DSL for MCP. Agents are good at writing GraphQL strings; the value-add for MCP is schema discovery, not selection construction.
- Saved-query recipes (op + variables + fragment bundle as one named call). Fragments cover field reuse; variable reuse is deferred. Shell aliases suffice for v1.
- Translation-field helper (`translations { languageCode … }`). Deferred.
- Fuzzy schema search tool. `vex_list_operations` substring match + `vex_describe_type` cover most cases.
- Server-side fragment expansion in MCP. Agents read SDL via `vex_get_fragment` and splice explicitly — keeps behavior predictable.

## 3. Architecture

Three new layers slot into Vex's existing three-layer pattern (services / commands / tools).

### 3.1 Schema-model layer — `src/schema-model/`

Pure functions over a parsed `GraphQLSchema` (built from the cached SDL with `graphql.buildSchema`). Stateless; no I/O. The only layer that knows GraphQL AST internals.

| File | Responsibility |
|---|---|
| `parse.ts` | Build & cache `GraphQLSchema` from SDL text. Per-process cache keyed by env name + SDL hash. |
| `classify.ts` | Detect `PaginatedList`, `*ListOptions`, `ErrorResult` unions, typed `customFields` blobs. Detection rules in §4.2. |
| `walk.ts` | Compute reachable leaf-field paths up to `maxDepth`. Used by the flat path selector. |
| `render.ts` | Render a `Selection` tree to a GraphQL selection-set string; assemble fragment-spread definitions and emit a complete document. |
| `types.ts` | `Selection`, `Variables`, shared types. |

`Selection` shape:

```ts
type Selection =
  | { kind: 'scalar' }
  | { kind: 'object'; fields: Record<string, Selection>; args?: Record<string, unknown> }
  | { kind: 'union'; branches: Record<string, Selection>; includeTypename: boolean }
  | { kind: 'fragmentRef'; name: string };
```

Internal data type only — never JSON-serialized for users. Three jobs use it: the wizard builds it incrementally, the fragment loader produces it from a `*.graphql` file, the renderer turns it into a query string.

### 3.2 Builder service — `src/services/builder.ts`

Single function: takes operation name + `Selection` + `Variables` → produces an executable GraphQL document and variables object → calls `getClient().request(...)`. Same pattern as the existing `executeQuery` but with selection construction in front. Used by the CLI wizard.

### 3.3 Wizard layer — `src/wizard/`

Interactive prompts using `@clack/prompts`. Talks to the schema-model layer for what's-possible questions and the fragment store for save/load. Never touches the network directly.

| File | Responsibility |
|---|---|
| `pickOperation.ts` | Resolve operation name; if missing, run text-filter + clack `select` over operations of the requested kind. |
| `promptVariables.ts` | Per-arg prompts; structured ListOptions sub-flow when applicable. |
| `pickPreset.ts` | Saved fragments / All scalars / All scalars +1 / Customize / Paste GraphQL. |
| `pickFields.ts` | Flat path multi-select with depth control. |
| `saveFragment.ts` | Post-customize save prompt. |
| `run.ts` | Orchestrator; entry point for the CLI command. |

> Clack note: clack does not ship a fuzzy-search prompt. The operation picker is implemented as a `text` "filter (empty for all)" prompt followed by a `select` over the filtered results. Same UX in two prompts.

### 3.4 Fragment store — `src/services/fragments.ts`

Per-environment SDL files at `~/.vendure-vex/fragments/{envName}/{Name}.graphql`. One fragment per file, filename basename equals fragment name (autocorrected on next save if hand-edited apart). Functions: `loadFragment`, `saveFragment`, `listFragments`, `deleteFragment`. Cycle detection on composition. Validates against the cached schema on load and save.

### 3.5 New CLI commands — `src/commands/`

| File | Commands |
|---|---|
| `build.ts` | New `build` command; root program also wires `-q <name>` / `-m <name>` short flags as aliases. |
| `fragment.ts` | `vex fragment list [--type Customer]`, `vex fragment show <Name>`, `vex fragment delete <Name>`. |

### 3.6 New MCP tool groups — `src/tools/`

| File | Tools |
|---|---|
| `schemaIntrospection.ts` | `vex_describe_type`, `vex_list_custom_fields`, `vex_list_operations`, `vex_describe_operation` |
| `fragments.ts` | `vex_list_fragments`, `vex_get_fragment`, `vex_save_fragment`, `vex_delete_fragment` |

### 3.7 Files modified

- `src/cli.ts` — register the new `build` command and `fragment` subcommand; add top-level `-q` / `-m` short flags. Existing entity commands untouched.
- `src/mcp.ts` — register the two new tool groups. No changes to existing tools.
- `src/config.ts` — add `getFragmentsDir(envName)` helper alongside existing `getSchemaPath(envName)`. No config-shape changes.
- `src/constants.ts` — add `DEFAULT_SELECTOR_MAX_DEPTH = 3` and `MAX_SELECTOR_DEPTH = 6`.
- `package.json` — add `@clack/prompts` runtime dependency; add `vitest` dev dependency.

## 4. CLI wizard flow

End-to-end walkthrough of `vex -q customers` (mutations follow the same flow with the differences noted below).

### 4.1 Steps

**Step 0 — resolve operation.** If `OperationName` is provided, look it up in the cached schema. If missing or no name given, open a fuzzy picker (text filter + clack `select`) listing all queries for `-q` (mutations for `-m`). Selection yields the `GraphQLField` for that operation.

**Step 1 — variables prompt loop.** For each argument on the operation:
- If the arg type is a `*ListOptions` input (helper b), enter the structured ListOptions sub-flow:
  - `take` → number input, default `DEFAULT_PAGE_SIZE` (20).
  - `skip` → number input, default `DEFAULT_SKIP` (0).
  - `sort` → optional. List the type's sort fields (from `*SortParameter`), pick zero or more, choose `ASC`/`DESC` per field.
  - `filter` → optional. Pick a field, pick an operator from the schema-defined operators on that filter input (`contains`, `eq`, `gt`, …), enter a value. Loop "add another filter?" until done.
- Otherwise, prompt for the arg by its type:
  - Scalars: text / number / boolean toggle.
  - Enums: clack `select` over the enum values.
  - Nested input objects (non-ListOptions): single `text` prompt expecting a JSON string. Parse and validate against the input type's shape; on parse error, re-show the prompt with the error message inline. (A structured per-field prompt for arbitrary nested inputs is deferred to v2.)
  - Required args are required; optional args show a "skip" choice.

**Step 2 — selection preset menu.** For the operation's return type:
- If return type is a `PaginatedList` (helper a), the menu operates on the inner `items` element type, and the wizard auto-includes `totalItems` on the wrapper.
- If return type is a union containing any `ErrorResult` member (helper c), the menu splits into success-branch field selection + auto-include `... on ErrorResult { __typename errorCode message }` on every error branch (no prompts for error-branch fields in v1).
- The menu offers, in order:
  1. **Saved fragments for this type** (one entry per matching `*.graphql` file in the fragment store).
  2. **All scalars** (recommended) — every leaf scalar field one level deep.
  3. **All scalars + 1 level deep** — same plus all nested objects' scalars.
  4. **Customize** → opens the flat path selector.
  5. **Paste GraphQL selection set** — escape hatch; wizard parses and validates against the schema.

**Step 3 — flat path selector** (only if Customize). Clack `multiselect` listing every reachable leaf-field path up to `DEFAULT_SELECTOR_MAX_DEPTH` (3). Each item shows path + scalar type, e.g. `addresses.country.code (String)`. Custom-fields paths surface as `customFields.vatId (String)` because the schema already exposes them. To go deeper, re-open with `--max-depth N` (capped by `MAX_SELECTOR_DEPTH` = 6).

**Step 4 — save fragment** (post-customize only). Prompt: "Save this selection as a fragment? (y/N)". If yes, suggest `{TypeName}Custom` as a default name, validate CamelCase, write the file. Skipped if the user picked an existing fragment in Step 2.

**Step 5 — preview + execute.** Always print the constructed GraphQL document (plain monospace; no syntax highlighter dependency in v1). Then:
- Default: execute and print JSON response.
- `--dry-run`: print the document, exit without executing.
- `--quiet`: skip the preview, just print the response.
- `--fragment NameOnly`: skip Steps 2–4 entirely, use the named fragment.
- `--max-depth N`: override `DEFAULT_SELECTOR_MAX_DEPTH` for the flat path selector (Step 3). Capped at `MAX_SELECTOR_DEPTH` (6).

**Mutations** follow the same flow. Selection is built on the mutation's success branch; ErrorResult auto-handling per helper c.

### 4.2 Helper detection rules

All detection is structural over the parsed schema. No hardcoded type-name lists.

**Helper a — `PaginatedList`.** Return type is an object that implements an interface named `PaginatedList`, **or** has both `items: [T!]!` and `totalItems: Int!` fields (covers schemas that don't formally implement the interface — e.g. some custom plugins).

**Helper b — `*ListOptions`.** Arg's input type name ends in `ListOptions` AND has fields named `take`, `skip` (and optionally `filter`, `sort`). Sort fields come from `*SortParameter`; filter fields and per-field operators come from `*FilterParameter`.

**Helper c — `ErrorResult`.** Return type is a `GraphQLUnionType` with ≥1 member that implements an interface named `ErrorResult`, **or** has both `errorCode: String!` and `message: String!` (same fallback pattern as a).

**Helper e — Custom fields.** Type has a field named `customFields` whose type is a non-null object type. JSON-typed `customFields` falls through to the generic JSON-input prompt (older Vendure / no custom fields configured).

## 5. Saved fragments

### 5.1 Storage and naming

- Path: `~/.vendure-vex/fragments/{envName}/{Name}.graphql`.
- Per-environment scope (custom-field shapes differ per Vendure instance — sharing across environments would mix them up, especially for agents).
- File contents: a single valid GraphQL `fragment` definition. Example:

  ```graphql
  fragment CustomerBasic on Customer {
    id
    firstName
    lastName
    customFields {
      vatId
    }
  }
  ```

- Naming: CamelCase, `[A-Za-z][A-Za-z0-9]*`. Convention (not enforced): start with the type name (`CustomerBasic`, `OrderWithLines`).
- Filename basename must equal fragment name. Validated on save and load. If they diverge from a hand-edit, the file's fragment name wins and the file is renamed on next save.

### 5.2 Loading

`loadFragment(envName, name): Selection`:
- Reads file, parses with `graphql.parse`.
- Walks AST into a `Selection` tree.
- Validates against the cached schema — every field must exist on its parent type, otherwise throws with the field path and a hint to run `vex schema refetch`.
- Resolves `FragmentSpread` nodes recursively, inlining referenced fragments into the `Selection`.
- Cycle detection: tracks the resolution stack; throws on a cycle with the chain printed.
- Per-process cache; invalidated when the schema is refetched.

### 5.3 Saving from the wizard

After Customize, prompt "Save as fragment? (y/N)". On yes: suggest `{TypeName}Custom`, validate name, atomic write (`writeFile` to `.tmp` then `rename`). If the file already exists, confirm overwrite — default no, prompt for a different name.

### 5.4 Using a fragment

- **Wizard preset menu (Step 2):** lists files where the on-clause type matches the current type. Reading the on-clause requires parsing each candidate file in the env's fragment dir; result cached after first read per process.
- **CLI flag:** `vex -q customers --fragment CustomerBasic` skips Steps 2–4.
- **MCP:** not auto-injected. Agent reads SDL via `vex_get_fragment` and decides what to do — typically pastes the fragment definition into the query string sent to `vex_query`. Server-side expansion would surprise the agent; explicit is better.

### 5.5 Render time

The renderer walks the `Selection`, emits `...FragmentName` for `fragmentRef` entries, and appends every transitively-referenced fragment definition to the document. Result is one self-contained query string sent to the GraphQL endpoint. Vex does not pre-inline.

### 5.6 CLI commands for management

- `vex fragment list [--type Customer]` — list fragments, optionally filtered by on-clause type.
- `vex fragment show <Name>` — print the SDL.
- `vex fragment delete <Name>` — confirm, then unlink.

These mirror the MCP `vex_list_fragments` / `vex_get_fragment` / `vex_delete_fragment` tools.

## 6. MCP tools

All read from the cached schema (`loadSchema(env, envName)` parsed once and cached on the MCP server lifetime). `vex_refetch_schema` invalidates the cache.

### 6.1 Schema introspection — `src/tools/schemaIntrospection.ts`

| Tool | Args | Returns |
|---|---|---|
| `vex_describe_type` | `typeName: string`, `depth?: 1` (max 2) | SDL for the type plus SDL for every type it references at the requested depth. Includes interfaces the type implements. Excludes built-in scalars. |
| `vex_list_custom_fields` | `typeName: string` | Array of `{ name, type, nullable, list, description }` for every field on `{TypeName}.customFields` if such a typed sub-object exists. Returns `{ customFields: null, message: "..." }` when absent. **Headline tool for the custom-fields use case.** |
| `vex_list_operations` | `kind?: "query" \| "mutation"`, `search?: string` | Array of `{ name, kind, returnType, args: [{name, type}] }`. Substring match, case-insensitive. |
| `vex_describe_operation` | `name: string` | Full signature SDL for one operation, plus SDL for its arg input types and return type at depth 1. |

### 6.2 Fragments — `src/tools/fragments.ts`

| Tool | Args | Returns |
|---|---|---|
| `vex_list_fragments` | `type?: string` | Array of `{ name, onType, fields: <count>, path }`. Metadata only. |
| `vex_get_fragment` | `name: string` | Raw SDL of the fragment file. |
| `vex_save_fragment` | `name: string` (CamelCase, validated), `sdl: string`, `overwrite?: boolean` | Parses with `graphql.parse`, validates against the cached schema, rejects if `name` ≠ fragment definition's name, atomic write. Returns `{ name, onType, path }` on success, structured error on parse/validation/collision. |
| `vex_delete_fragment` | `name: string` | `{ deleted: true }` or `{ deleted: false, reason: "not found" }`. |

`vex_save_fragment` exists so agents can persist useful selections (especially custom-field combinations) back to the fragment store, where they're available to the next session and to the CLI wizard.

## 7. Edge cases

- **Schema not cached.** Wizard prompts "schema not introspected yet — run now? (y/N)"; on yes, calls existing `refetchSchema` then continues.
- **Operation name not found.** List the closest 5 names by Levenshtein distance and exit nonzero.
- **Recursive types.** Selector hits `maxDepth` and stops; the user sees "(deeper paths truncated, increase --max-depth)".
- **Interfaces / abstract types in selection.** When a field's type is an interface, treat it as an object on the interface's common fields; do not auto-inline implementations. Inline-fragment-on-implementation is an escape hatch via the "Paste GraphQL selection" preset.
- **Empty `customFields`.** Schemas may declare `customFields: JSON` instead of a typed sub-object. Detection treats only typed sub-objects as the helper case; JSON-typed `customFields` falls through to the generic JSON-input prompt.
- **Mutation success branch with no fields.** Some mutations return `Success` with only `__typename` — wizard skips Step 2 and renders `... on Success { __typename }`.
- **`--dry-run` + `--fragment`** is valid: render the document using the saved fragment, print, exit. No network call.
- **TTY detection.** If stdout is not a TTY (piped), the wizard refuses to run interactively and instructs the user to use `--fragment` plus variable flags. Don't auto-pick defaults silently.
- **Concurrent fragment writes.** Atomic `.tmp` + rename; no locking. Fragment files are user-scoped; conflicts are extremely unlikely. Last write wins.
- **Invalid JSON in nested-input prompt.** Re-show the prompt with the parse error inline; do not advance until valid JSON is provided or the user cancels (Ctrl+C / clack `isCancel()`).
- **User cancels mid-wizard.** Clack's `isCancel()` returns true → wizard exits with code 130 and prints "Cancelled. No request sent." Nothing is saved.

## 8. Testing

The project has no test framework today. Add **Vitest** as a devDependency (Node-native, ESM-friendly, matches the `tsx` setup) and test by layer.

| Layer | Coverage |
|---|---|
| `schema-model/` | Unit tests with hand-written tiny SDL fixtures. Covers classify rules, walk depth limits, render output equality. |
| `services/fragments.ts` | Unit tests against a temp dir. Parse-then-render round-trip, cycle detection, schema validation. |
| `services/builder.ts` | Unit tests with a mocked client. Verifies constructed query string and variables shape for representative scenarios (paginated list with filter+sort, mutation with ErrorResult union, fragment-spread expansion). |
| `wizard/` | **Not** unit-tested in v1. Manual smoke tests against a real Vendure schema; document a manual test script. |

Coverage target: 80% for `schema-model/` and `services/{builder,fragments}.ts` per the project's testing rule. The wizard layer is excluded from the coverage gate.

`npm` scripts to add: `test` (`vitest run`), `test:watch` (`vitest`).

## 9. Dependencies

- Add: `@clack/prompts` (runtime), `vitest` (dev).
- No removals.
- No version-pinning specifics in this design — implementation plan picks current stable.

## 10. Open questions

None at design time. All Q&A from brainstorming is captured above.

## 11. Implementation order (preview)

This is a sketch for the planning step, not part of the design itself. The plan will refine.

1. Schema-model layer (`parse`, `classify`, `walk`, `render`) + Vitest setup with fixture SDL.
2. Builder service.
3. Fragment store.
4. MCP tools (introspection + fragments).
5. CLI commands: `fragment` subcommand.
6. Wizard layer (in order: pickOperation → promptVariables → pickPreset → pickFields → saveFragment → run).
7. CLI wiring: `build` command + `-q` / `-m` short flags.

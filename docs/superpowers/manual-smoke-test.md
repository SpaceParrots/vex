# Manual smoke test — GraphQL builder wizard

The wizard layer (`src/wizard/**`) and the CLI/MCP surfaces that thin-wrap it
are excluded from automated tests because they require a real Vendure
environment, a TTY, and live network/disk side effects. Run these checks
against a real Vendure environment after any change to:

- `src/wizard/**`
- `src/commands/build.ts`
- `src/commands/fragment.ts`
- `src/tools/fragments.ts`
- `src/tools/schemaIntrospection.ts`
- `src/services/builder.ts`
- `src/services/fragments.ts` (when load/save/render integration changes)

Coverage of the underlying schema model, builder, and fragment store is
verified by `npm run test:coverage` (≥ 80% on `src/schema-model/**`,
`src/services/builder.ts`, `src/services/fragments.ts`).

---

## Setup

Add an environment that points at a real Vendure Admin API and fetch the
schema once so the wizard can introspect it offline:

```
vex env add staging \
  --url https://staging.example.com/admin-api \
  --api-key XXXXXXXX \
  --fetch-schema
vex env use staging
vex schema show staging | head     # sanity: schema present
```

---

## Scenario 1 — Paginated query, all scalars (UX baseline)

```
vex build -q customers
```

Walk through:
- Operation is auto-resolved by name.
- ListOptions sub-flow asks for `take`, `skip`, `sort`, `filter`.
- Preset menu shows `All scalars (recommended)` first.
- Pre-execution preview prints the constructed `query Customers(...) { customers(...) { items { ... } totalItems } }`.
- Response JSON shows `items[]` with scalar fields, plus `totalItems`.

Pass criteria: no exception, no manual editing of the generated document, response shape matches the printed query.

---

## Scenario 2 — Mutation with ErrorResult union

```
vex build -m createCustomer
```

Walk through:
- Wizard prompts for each scalar arg (`emailAddress`, `firstName`, etc.).
- Return type is detected as a union (`CreateCustomerResult` or similar).
- Preset menu only appears for the success branch (`Customer`); error branches are auto-selected as `{ errorCode message }`.
- Document includes `__typename`, `... on Customer { ... }`, and one `... on <ErrorType> { errorCode message }` for every error branch.
- Response either contains success data with the typed customer, or surfaces the error branch with `errorCode` populated.

Pass criteria: every union member appears in the printed document; no `... on UnknownType` typos.

---

## Scenario 3 — Custom fields on a Vendure entity

```
vex build -q customers --max-depth 3
```

When the preset menu appears, choose `Customize (flat path selector)` and verify the multi-select includes paths like:

- `items.customFields.<your-custom-field>` (custom fields on Customer)
- `items.customFields.someEntityRelation.<...>` if depth allows

Pick a few custom-field paths plus `id`, `emailAddress`, then accept. Verify the rendered query includes a `customFields { ... }` sub-selection on each item.

Pass criteria: the wizard surfaces every typed custom field that exists in `CustomerCustomFields` (or the equivalent `<Entity>CustomFields` block) without the user knowing the type's name in advance.

---

## Scenario 4 — Save and reuse a fragment

```
vex build -q customers --max-depth 3
# choose: Customize (flat path selector)
# pick a useful set of fields
# answer yes to "Save this selection as a fragment?"
# name it CustomerCardFields
```

Then list and inspect the fragment:

```
vex fragment list
vex fragment list --type Customer
vex fragment show CustomerCardFields
```

Now reuse it without re-walking the selector:

```
vex build -q customers --fragment CustomerCardFields --dry-run
```

Pass criteria:
- `vex fragment list` shows `CustomerCardFields` with the right `On Type` and field count.
- `vex fragment show` prints SDL with `fragment CustomerCardFields on Customer { ... }`.
- The `--fragment` invocation produces a document containing `fragment CustomerCardFields on Customer { ... }` plus `... CustomerCardFields` at the appropriate selection site.
- `--dry-run` exits without sending a request.

Cleanup:

```
vex fragment delete CustomerCardFields
```

Re-running `vex build -q customers --fragment CustomerCardFields` after delete must error with a "not found" message.

---

## Scenario 5 — Paste a raw selection set

```
vex build -q customer
# operation selected; provide an id
# preset menu → choose "Paste GraphQL selection set"
# paste:  { id firstName addresses { id streetLine1 country { code } } }
```

Pass criteria:
- The printed document wraps the pasted selection inside a synthetic fragment (`__Paste_<timestamp>`) and references it from the operation.
- The synthetic fragment is rejected (with a clear parse error) if the pasted text is not a valid selection set.

---

## Scenario 6 — MCP introspection from an LLM client

Start the MCP server (any stdio MCP client works; Claude Code is the most common):

```
vex serve
```

From the LLM client, exercise:

1. `vex_list_operations` (no args) — confirm a JSON list of every Query and Mutation root field.
2. `vex_list_operations { kind: "mutation", search: "create" }` — confirm filtering works.
3. `vex_describe_type { typeName: "Customer", depth: 1 }` — confirm the SDL slice includes `Customer` and its directly-referenced types (e.g. `CustomerCustomFields`, `Address`) but excludes built-in scalars (`String`, `ID`, etc.).
4. `vex_describe_type { typeName: "Customer", depth: 2 }` — confirm one further hop is included (e.g. `Country` reachable via `Address.country`).
5. `vex_list_custom_fields { typeName: "Customer" }` — confirm the JSON response carries every typed field on `CustomerCustomFields` with `name`, `type`, `nullable`, `list`.
6. `vex_describe_operation { name: "customers" }` — confirm the response shows the SDL signature plus `input CustomerListOptions` and `type CustomerList` slices.
7. `vex_save_fragment { name: "ProductCard", sdl: "fragment ProductCard on Product { id name slug }" }` — should succeed; subsequent `vex_list_fragments` shows it; `vex_delete_fragment { name: "ProductCard" }` removes it.
8. Calling `vex_save_fragment` with an SDL whose name does not match the `name` argument must reject with a clear error.

Pass criteria: every tool returns structured output an LLM can act on; errors include the offending name; no leaked stack traces; no MCP-protocol violations in the client log.

---

## Scenario 7 — Cancellation safety

For every prompt in every wizard run, verify Ctrl+C exits with code 130 and the literal `Cancelled. No request sent.` line, and that no partial fragment file is left behind in `~/.vendure-vex/fragments/<env>/`. The atomic write contract (`<file>.tmp` then rename) means a cancel before persistence must leave nothing on disk; a cancel after the `rename` call should leave the fragment intact (the wizard will not have reached that point because `saveFragment` is the last step).

---

## Regression checklist before merging wizard changes

| Check | Where verified |
| --- | --- |
| `npm run lint` — green | local |
| `npm run typecheck` — green | local |
| `npm test` — 59+ tests green | local |
| `npm run test:coverage` — ≥ 80% on listed files | local |
| `npm run build` — `dist/` regenerates | local |
| Scenarios 1–7 above | live Vendure env |

Document any deviations in the PR description with the underlying Vendure schema specifics (custom field shape, plugin operations exercised, etc.).

# Copilot instructions for @spaceparrots/vex

Vex is a dual-mode **CLI tool and MCP server** for the **Vendure Admin GraphQL API**. It runs as
an MCP server by default (no args or `serve`) and as a CLI when invoked with commands. When
reviewing pull requests, enforce the conventions below.

## Architecture: the three-layer pattern

Every entity domain (customers, products, orders, zones, tax, channels, …) follows the same
three layers. New domains must follow it exactly — flag deviations.

1. **Services** (`src/services/*.ts`) — own **all** business logic. Stateless functions that
   build and execute GraphQL operations via `getClient()` → `client.request(...)`.
2. **Commands** (`src/commands/*.ts`) — thin Commander CLI wrappers: parse args, call a service,
   format output via `src/output.ts`.
3. **Tools** (`src/tools/*.ts`) — thin MCP wrappers: define Zod input schemas, call the same
   service functions, return via the shared `jsonContent()` helper.

**Flag any GraphQL query or domain logic placed in a command or tool** — it belongs in a service.

## Hard rules to check in review

- **Zod `.describe()` on every MCP tool parameter** — descriptions are the interface contract for
  MCP clients. Missing/vague descriptions are a review blocker.
- **MCP tool names** are prefixed `vex_` and use snake_case.
- **Immutable inputs** — service input interfaces use `readonly` fields; config updates return new
  objects via spread, never mutate in place.
- **Vendure union return types** — mutations return `... on Entity { ... } ... on ErrorResult
  { errorCode message }`. Both branches must be handled.
- **Pagination** — list operations accept Vendure `ListOptions` (`take`, `skip`, `filter`,
  `sort`); defaults `take: 20, skip: 0` come from `src/constants.ts`. No hardcoded magic values.
- **Helpful errors** — failures should say what went wrong and what to do next.
- **Small, focused files** — one service / commands / tools file per entity.

## Quality gates

Changes must pass `npm run lint`, `npm run typecheck`, `npm run build`, and `npm run test`
(Vitest, with 80% coverage thresholds on covered modules). Use Conventional Commits
(`feat:`, `fix:`, `refactor:`, …) so release-please can build the changelog.

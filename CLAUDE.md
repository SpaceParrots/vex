# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vex (`@spaceparrots/vex`) is a dual-mode CLI tool and MCP server for the **Vendure Admin GraphQL API**. It runs as an MCP server by default (no args or `serve`) or as a CLI when invoked with commands. Requires Vendure 3.6+ with API key authentication (`vendure-api-key` header).

Vendure is an open-source headless commerce framework. Vex wraps its **Admin API** — a GraphQL API for managing products, customers, orders, zones, tax, channels, and more. Vendure instances often have **custom plugins that extend the Admin API** with additional types, queries, and mutations beyond the core schema. Vex supports this via raw `vex_query`/`vex_mutate` tools and schema introspection/caching, so it can work with any custom Admin API shape.

## Commands

```bash
npm run build        # Compile TypeScript (tsc) to dist/
npm run dev          # Run directly with tsx (no compile needed)
npm run start        # Run compiled dist/index.js
npm run lint         # ESLint on src/
npm run typecheck    # tsc --noEmit
npm test             # Run the Vitest suite once
npm run test:watch   # Vitest in watch mode
npm run test:coverage # Vitest with v8 coverage (80% thresholds on covered modules)
```

Tests use **Vitest** (`tests/**/*.test.ts`); see `vitest.config.ts` for coverage scope and thresholds.

## Design Principles

### User Experience First

Vex is a user-facing tool. Every CLI command and MCP tool should feel intuitive and predictable:

- **Descriptive tool names and descriptions** — MCP tool descriptions are what Claude reads to decide which tool to use. They must be clear, specific, and self-contained.
- **Zod `.describe()` on every parameter** — Descriptions are the interface contract for MCP clients. Vague or missing descriptions degrade the experience.
- **Consistent CLI flags** — Follow Commander conventions. Use `--kebab-case` flags. Provide `--help` text for every option.
- **Helpful error messages** — When something fails, tell the user *what went wrong* and *what to do next*. The error in `getActiveEnv()` is a good example: it tells you no environment is configured and suggests the fix.
- **Sensible defaults** — Pagination defaults to `take: 20, skip: 0`. First environment added becomes active automatically.

### Clean, Consistent Code

- **One pattern, everywhere** — Every entity domain (customers, products, orders, etc.) follows the exact same three-layer structure. New domains must follow the same pattern, no exceptions.
- **Services own all business logic** — Commands and tools are thin wrappers that parse input and format output. Never put GraphQL queries or domain logic in commands or tools.
- **Immutable inputs** — All service input interfaces use `readonly` fields. Config updates return new objects via spread, never mutate in place.
- **Small, focused files** — Each file has a single responsibility. One service file per entity, one tools file per entity, one commands file per entity.

### Vendure API Awareness

- **Union return types on mutations** — Vendure mutations return `... on Entity { fields } ... on ErrorResult { errorCode message }`. Always handle both branches.
- **Schema-driven development** — The cached schema at `~/.vendure-vex/schemas/*.graphql` is the source of truth for what the Admin API supports. When adding new operations, consult it.
- **Custom APIs are first-class** — Vendure plugins extend the Admin API. When adding typed tools for custom plugin operations, follow the same three-layer pattern and align field names with the Vendure GraphQL schema.
- **Pagination pattern** — Vendure uses `ListOptions` with `take`, `skip`, `filter`, and `sort`. All list operations should accept these.

## Architecture

### Dual-Mode Entry (`src/index.ts`)

- No args or `serve` → MCP server via stdio transport (`src/mcp.ts`)
- Any other args → CLI via Commander (`src/cli.ts`)

### Three-Layer Pattern

Each Vendure entity (customers, products, orders, zones, tax, channels, assets) follows the same structure:

1. **Services** (`src/services/*.ts`) — Stateless functions that build and execute GraphQL operations. Every function calls `getClient()` → `client.request(query, variables)`. Magic values (pagination defaults, language codes) are imported from `src/constants.ts`.

2. **Commands** (`src/commands/*.ts`) — CLI wrappers using Commander. Parse args, call service functions, format output via `src/output.ts`.

3. **Tools** (`src/tools/*.ts`) — MCP tool wrappers. To minimize the always-on tool-definition surface MCP clients load every session, each entity domain (customers, products, orders, zones, tax, channels, assets) is exposed as a **single action-dispatch tool** (e.g. `vex_customers` with an `action` of `list`/`get`/`create`/…) built via the `actionTool` helper in `src/tools/action-tool.ts`. Each action declares its own Zod field shape plus a thin handler that calls the same service function and returns results via `jsonContent()`. `actionTool` merges all action shapes into one flat schema (MCP requires an object-typed `inputSchema`, so a root discriminated union is not usable) and re-validates input against the chosen action's schema at call time.

Commands and tools are thin wrappers; business logic lives in services. CLI commands stay fine-grained (one command per operation); only the MCP tools consolidate.

### Adding a New Entity Domain

1. Add service functions in `src/services/<entity>.ts` (follow `src/services/customers.ts` as reference)
2. Add CLI commands in `src/commands/<entity>.ts` and register in `src/cli.ts`
3. Add the MCP tool in `src/tools/<entity>.ts` — export `registerXyzTools(server: McpServer)` that calls `actionTool(server, "vex_<entity>", …)` with one entry per operation (follow `src/tools/customers.ts`), then register it in `src/mcp.ts` inside `registerTools` (in the full-mode block unless it belongs to the lean universal interface).

### Infrastructure

- **`src/config.ts`** — Environment management. Config persisted at `~/.vendure-vex/config.json`. Multiple named environments with url, apiKey, and optional schemaSource, plus a `projects` map (project directory → env name) written by `vex env link`.
- **`src/context.ts`** — Per-call environment resolution. `getCurrentEnv()` is the universal resolver used by `getClient()` and every env-name consumer; precedence is **explicit `env` param / CLI `--env` > `VEX_ENV` > project link matching cwd > active environment**. Project links live in `config.json`'s `projects` map and are managed via `vex env link`/`vex env unlink`. MCP tools opt in via `envAwareTool` (`src/tools/env-aware.ts`); the CLI via the root `--env` flag.
- **`src/errors.ts`** — Typed error hierarchy (`VexError` and subclasses like `NoEnvironmentError`, `EnvNotFoundError`, `GraphQLRequestError`, `PermissionError`) carrying a machine-readable `code` and an actionable `hint`; `toVexError()` normalizes any thrown value. Presenters (`output.ts`'s `handleError` for the CLI, `action-tool.ts`'s `toolErrorResult` for MCP) render message + hint uniformly.
- **`src/upload.ts`** — GraphQL multipart request transport for the Vendure `Upload` scalar (hand-rolled on native fetch/FormData; `graphql-request` v7 dropped upload support). Used by asset uploads and by `--file`/`files` on raw mutate.
- **`src/permission-errors.ts`** — Enriches FORBIDDEN/UNAUTHORIZED failures from the cached schema: names the denied operation and suggests likely `Permission` enum values.
- **`src/constants.ts`** — Shared constants (pagination defaults, language code, API key header name, masking parameters, the `VEX_TOOLS` env-var name).
- **`src/tools/action-tool.ts`** — `actionTool()` registers one MCP tool that dispatches over an `action` field; `dispatchAction()` (exported, unit-tested) does the per-action Zod validation and dispatch.
- **Tool gating** — `src/mcp.ts` reads `VEX_TOOLS`: `full` (default) registers all 15 tools; `lean`/`minimal` registers only the universal interface (`vex_setup`, `vex_current_env`, `vex_refetch_schema`, `vex_query`, `vex_mutate`, `vex_schema`).
- **`src/client.ts`** — GraphQL client factory using `graphql-request` with `vendure-api-key` header. Exports `getClient()` convenience helper.
- **`src/schema.ts`** — Schema introspection and caching at `~/.vendure-vex/schemas/*.graphql`. Exposed as MCP resource (`vendure://schema/{envName}`).
- **`src/output.ts`** — CLI output formatting (`printJson`, `printSuccess`, `printError`, `printInfo`, `printTable`, `handleError`) and the shared `jsonContent()` MCP response helper.

## Conventions

- Tool names are prefixed with `vex_` and use snake_case; `action` values use snake_case too (e.g. `add_note`, `create_variants`)
- File names are kebab-case (`action-tool.ts`, `env-add.ts`, `schema-introspection.ts`) — enforced by `unicorn/filename-case` in `npm run lint`
- Every exported function, tool, and module carries a JSDoc comment; files open with an `@module` block
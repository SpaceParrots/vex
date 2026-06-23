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

Each Vendure entity (customers, products, orders, zones, tax, channels) follows the same structure:

1. **Services** (`src/services/*.ts`) — Stateless functions that build and execute GraphQL operations. Every function calls `getClient()` → `client.request(query, variables)`. Magic values (pagination defaults, language codes) are imported from `src/constants.ts`.

2. **Commands** (`src/commands/*.ts`) — CLI wrappers using Commander. Parse args, call service functions, format output via `src/output.ts`.

3. **Tools** (`src/tools/*.ts`) — MCP tool wrappers. Define Zod schemas for input validation, call the same service functions, return results via the shared `jsonContent()` helper from `src/output.ts`.

Commands and tools are thin wrappers; business logic lives in services.

### Adding a New Entity Domain

1. Add service functions in `src/services/<entity>.ts` (follow `src/services/customers.ts` as reference)
2. Add CLI commands in `src/commands/<entity>.ts` and register in `src/cli.ts`
3. Add MCP tools in `src/tools/<entity>.ts` (export `registerXyzTools(server: McpServer)`) and register in `src/mcp.ts`

### Infrastructure

- **`src/config.ts`** — Environment management. Config persisted at `~/.vendure-vex/config.json`. Multiple named environments with url, apiKey, and optional schemaSource.
- **`src/env-context.ts`** — Per-call environment resolution. `getCurrentEnv()` is the universal resolver used by `getClient()` and every env-name consumer; precedence is **explicit `env` param / CLI `--env` > `VEX_ENV` > active environment**. MCP tools opt in via `envAwareTool` (`src/tools/env-aware.ts`); the CLI via the root `--env` flag.
- **`src/constants.ts`** — Shared constants (pagination defaults, language code, API key header name, masking parameters).
- **`src/client.ts`** — GraphQL client factory using `graphql-request` with `vendure-api-key` header. Exports `getClient()` convenience helper.
- **`src/schema.ts`** — Schema introspection and caching at `~/.vendure-vex/schemas/*.graphql`. Exposed as MCP resource (`vendure://schema/{envName}`).
- **`src/output.ts`** — CLI output formatting (`printJson`, `printSuccess`, `printError`, `printInfo`, `printTable`, `handleError`) and the shared `jsonContent()` MCP response helper.

## Conventions

- Tool names are prefixed with `vex_` and use snake_case
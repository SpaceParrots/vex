# Vex
![](https://img.shields.io/badge/Node.js-20%2B-brightgreen?style=flat-square) [![npm]](https://www.npmjs.com/package/@spaceparrots/vex)

[npm]: https://img.shields.io/npm/v/%40spaceparrots%2Fvex.svg?style=flat-square

Your **v**endure admin-api graphql query **ex**ecutor. CLI tool and MCP server for the Vendure Admin GraphQL API.

![vex-mascot-banner](https://github.com/user-attachments/assets/52237673-4c6b-4e12-966a-8ab942e95744)

Use `vex` from your terminal to manage products, customers, and orders — or connect it as an MCP server so Claude can do it for you.

## Features

- **Environment management** — add, switch, configure, and health-check multiple Vendure instances
- **Interactive query builder** — pick an operation, prompt for variables (with proper type coercion), choose fields, and run
- **Typed resource commands** — CRUD for customers, products, orders, channels, zones, and tax out of the box
- **Schema-aware** — fetch and cache your Vendure schema (works with custom plugins) and introspect it from the CLI or MCP
- **Reusable building blocks**
  - **Fragments** — named field selections you can reuse across operations
  - **Saved operations** — full queries/mutations with their default variables, replayable via `vex run`
- **Raw GraphQL** — run any query or mutation directly when you need the escape hatch
- **MCP server** — expose every command and saved operation as tools so Claude can chain them via natural language

## Installation

```bash
npm install -g @spaceparrots/vex
```

This puts the `vex` command on your PATH.

## Requirements

**Vendure 3.6+** is required. Vex uses the [API key authentication](https://docs.vendure.io/current/core/developer-guide/api-keys) method introduced in Vendure 3.6.

To set up your Vendure instance:

1. Enable API key auth in your Vendure config:
   ```ts
   authOptions: {
       tokenMethod: ['cookie', 'bearer', 'api-key'],
   }
   ```
2. Go to **Settings > API Keys** in the Vendure dashboard
3. Create a new key, assign the roles/permissions it needs, and copy the key (it's shown only once)

The key is sent via the `vendure-api-key` header on every request.

## Quick start

```bash
# Add an environment — interactive wizard prompts for missing values and validates by fetching the schema
vex env add dev

# Or non-interactive
vex env add dev --url http://localhost:3000/admin-api --api-key sk-123456

# Verify it's healthy
vex env status dev

# Build a query interactively (pick fields, fill variables, see the GraphQL document)
vex build -q customers

# Save the built query for replay
vex build -q contents --save ContentsPublished

# Replay it later, optionally overriding variables
vex run ContentsPublished --var "options={\"take\":5}"

# Fetch and cache the schema (auto-fetched on first use)
vex schema fetch
```

## CLI reference

### Environment management

```bash
vex env add <name> [--url <url>] [--api-key <key>]   # Interactive when --url or --api-key is missing.
                   [--schema-type endpoint|file]      # Validates by fetching the schema (or reading the SDL file).
                   [--schema-value <value>]
                   [--no-validate]
vex env list                                          # List all environments
vex env switch <name>                                 # Switch active environment
vex env set <name> [--url <url>] [--api-key <key>]    # Update environment fields
vex env remove <name>                                 # Remove environment
vex env show <name>                                   # Show environment details (API key masked)
vex env status <name> [--json]                        # Check endpoint reachability + schema accessibility
```

### Targeting a specific environment

vex resolves the environment for each operation in this order:

1. An explicit name — the `env` parameter on any MCP tool, or `--env <name>` on any CLI command.
2. The `VEX_ENV` environment variable — handy as a per-project default.
3. The globally active environment (`vex env switch <name>`).

Per-project default via `.mcp.json` (no switching needed):

```json
{
  "mcpServers": {
    "vex": { "command": "vex", "env": { "VEX_ENV": "myproject-staging" } }
  }
}
```

Check what's in use any time:

```bash
vex env current
# → myproject-staging → staging.example.com (via VEX_ENV)
```

The `vex_current_env` MCP tool returns the same one-line summary.

### Schema

```bash
vex schema fetch [--env <name>]                       # Fetch and cache GraphQL schema
```

### Interactive builder

```bash
vex build -q <name>                                   # Build a query — name is optional, you can pick interactively
vex build -m <name>                                   # Build a mutation
        [--fragment <Name>]                           # Use a saved fragment as the selection set
        [--max-depth <n>]                             # Cap the field-picker depth
        [--dry-run]                                   # Print without executing
        [--verbose]                                   # Also print the rendered document and variables before executing
        [--save <Name>] [--overwrite]                 # Persist the result for later replay with `vex run`
```

### Saved operations

```bash
vex run <Name>                                        # Replay a saved operation
        [--var key=value ...]                         # Override one top-level variable (JSON-parsed; repeatable)
        [--vars-json '<json>']                        # Replace the full variables object
        [--dry-run] [--verbose]
vex operation list [--kind query|mutation] [--root-field <name>]
vex operation show <Name> [--json]
vex operation delete <Name>
```

### Fragments

```bash
vex fragment list                                     # List saved fragments (created during `vex build` -> Customize -> Save)
vex fragment show <Name>
vex fragment delete <Name>
```

### Generic GraphQL

```bash
vex query '<graphql>' [--variables '<json>']          # Run any query
vex mutate '<graphql>' [--variables '<json>']         # Run any mutation
```

### Customers, Products, Orders, Channels, Zones, Tax

Each resource supports `list`, `get`, `create`, `update`, and `delete` plus resource-specific actions (e.g. `customer add-note`, `product add-variants`, `order transition`, `zone add-members`, `tax create-rate`). Run `vex <resource> --help` for full options.

## Two-minute walkthrough

```bash
# 1. Add an env (interactive — prompts for URL, key, validates the schema)
$ vex env add dev

# 2. Build, save, dry-run a paginated query
$ vex build -q contents --save ContentsPublished --dry-run

# 3. Replay with a different page size
$ vex run ContentsPublished --var "options={\"take\":50}"

# 4. Browse what's saved
$ vex operation list
$ vex operation show ContentsPublished

# 5. Check the environment any time
$ vex env status dev
Environment: dev (active)
URL:         http://localhost:3000/admin-api
Endpoint:    OK   reachable, API key accepted
Schema:      OK   cached (412331 bytes, mtime 2026-05-11T...)
```

## MCP setup (Claude Code)

Add to your project's `.mcp.json` or global `~/.claude.json`:

```json
{
  "mcpServers": {
    "vex": {
      "command": "npx",
      "args": ["-y", "@spaceparrots/vex"]
    }
  }
}
```
> Windows might require to run it via `cmd /c "npx -y @spaceparrots/vex"`

Running `vex` with no arguments starts the MCP server on stdio — this is what MCP clients expect.

Once connected, ask Claude:

> Add my Vendure dev server at http://localhost:3000/admin-api with API key sk-1234

Then you can use natural language:

> Create me a dummy order for product "shoes"

Claude will check if the product exists, create it if needed, find or create a customer, create a draft order, and add items — all by chaining the MCP tools automatically.

Server-level **`instructions`** are shipped with the MCP handshake, so Claude already knows the tool tiers (typed entity tools → schema discovery → raw GraphQL), how saved operations and fragments work, and how to handle Vendure's union-result mutations.

### Available MCP tools

To keep the per-session token cost low, vex groups each entity domain into a **single action-dispatch tool**: you pass an `action` parameter (e.g. `list`, `get`, `create`) plus that action's fields. In full mode vex exposes **14 tools**:

| Group | Tool | Actions |
|-------|------|---------|
| Setup & schema | `vex_setup`, `vex_refetch_schema`, `vex_current_env` | (standalone) |
| Schema discovery | `vex_schema` | `describe_type`, `list_custom_fields`, `list_operations`, `describe_operation` |
| Raw GraphQL | `vex_query`, `vex_mutate` | (standalone) |
| Customers | `vex_customers` | `list`, `get`, `create`, `update`, `delete`, `add_note` |
| Products | `vex_products` | `list`, `get`, `create`, `update`, `delete`, `create_variants` |
| Orders | `vex_orders` | `list`, `get`, `create_draft`, `add_item`, `set_customer`, `transition`, `cancel` |
| Channels | `vex_channels` | `list`, `get`, `get_active`, `update` |
| Zones & countries | `vex_zones` | `list`, `get`, `create`, `update`, `delete`, `add_members`, `remove_members`, `create_country`, `list_countries` |
| Tax | `vex_tax` | `list_categories`, `get_category`, `create_category`, `delete_category`, `list_rates`, `get_rate`, `create_rate`, `update_rate`, `delete_rate` |
| Fragments | `vex_fragments` | `list`, `get`, `save`, `delete` |
| Saved operations | `vex_operations` | `list`, `get`, `run`, `delete` |

Example call: `vex_products` with `{ "action": "get", "id": "5" }`.

The cached GraphQL schema is also exposed as the MCP resource `vendure://schema/<envName>` so Claude can read it as ground truth.

#### Lean mode (`VEX_TOOLS=lean`)

Set the env var `VEX_TOOLS=lean` (alias `minimal`) in your MCP client config to register only the **universal interface** — `vex_setup`, `vex_current_env`, `vex_refetch_schema`, `vex_query`, `vex_mutate`, and `vex_schema` (6 tools). Claude drives Vendure via `vex_schema` discovery plus raw GraphQL, trading some convenience for the smallest possible per-session token footprint. The default (`VEX_TOOLS` unset or `full`) registers all 14 tools.

```jsonc
{
  "mcpServers": {
    "vex": {
      "command": "npx",
      "args": ["-y", "@spaceparrots/vex"],
      "env": { "VEX_TOOLS": "lean" }
    }
  }
}
```

> Tip: MCP responses are compact JSON by default. Set `VEX_PRETTY_JSON=1` to pretty-print them (useful for debugging, ~30% more tokens).

## Configuration

Configuration lives under `~/.vendure-vex/`:

| Path | What's there |
|------|--------------|
| `config.json` | Environments: `{ url, apiKey, schemaSource? }` keyed by name + `activeEnvironment` |
| `schemas/<env>.graphql` | Cached SDL per environment |
| `fragments/<env>/<Name>.graphql` | Saved fragments per environment |
| `operations/<env>/<Name>.json` | Saved operations (document + default variables) per environment |

Environment names are restricted to `[A-Za-z0-9_-]+` for path safety.

## Development

```bash
npm install
npm run build        # Compile to dist/
npm run dev          # Run with tsx (no build)
npm run typecheck    # Type check only
npm test             # Run the vitest suite
```

## License

MIT

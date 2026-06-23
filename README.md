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

Server-level **`instructions`** are shipped with the MCP handshake, so Claude already knows the tool tiers (typed CRUD → schema introspection → raw GraphQL), how saved operations and fragments work, and how to handle Vendure's union-result mutations.

### Available MCP tools

When used as an MCP server, vex exposes ~55 tools across these groups:

| Group | Example tools | What it covers |
|-------|--------------|----------------|
| Setup & schema | `vex_setup`, `vex_refetch_schema` | Add/list/switch envs, refresh the cached schema |
| Schema introspection | `vex_list_operations`, `vex_describe_operation`, `vex_describe_type`, `vex_list_custom_fields` | Discover what the API supports (great with plugin-extended schemas) |
| Raw GraphQL | `vex_query`, `vex_mutate` | Escape hatch for custom plugin operations |
| Customers | `vex_get_customers`, `vex_get_customer`, `vex_create_customer`, `vex_update_customer`, `vex_delete_customer`, `vex_add_customer_note` | |
| Products | `vex_get_products`, `vex_get_product`, `vex_create_product`, `vex_update_product`, `vex_delete_product`, `vex_create_product_variants` | |
| Orders | `vex_get_orders`, `vex_get_order`, `vex_create_draft_order`, `vex_add_item_to_draft_order`, `vex_set_customer_for_draft_order`, `vex_transition_order`, `vex_cancel_order` | |
| Channels | `vex_get_channels`, `vex_get_channel`, `vex_get_active_channel`, `vex_update_channel` | |
| Zones & countries | `vex_get_zones`, `vex_create_zone`, `vex_add_members_to_zone`, `vex_create_country`, `vex_get_countries`, … | |
| Tax | `vex_get_tax_categories`, `vex_create_tax_rate`, `vex_update_tax_rate`, … | |
| Fragments | `vex_list_fragments`, `vex_save_fragment`, `vex_get_fragment`, `vex_delete_fragment` | Reusable field selections |
| Saved operations | `vex_list_saved_operations`, `vex_get_saved_operation`, `vex_run_saved_operation`, `vex_delete_saved_operation` | Full queries/mutations with default variables, replayable |

The cached GraphQL schema is also exposed as the MCP resource `vendure://schema/<envName>` so Claude can read it as ground truth.

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

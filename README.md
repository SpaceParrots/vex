# vendure-vex

CLI tool and MCP server for the Vendure Admin GraphQL API.

Use `vex` from your terminal to manage products, customers, and orders — or connect it as an MCP server so Claude can do it for you.

## Installation

```bash
npm install -g @spaceparrots/vex
```

This puts the `vex` command on your PATH.

## Quick start

```bash
# Add an environment
vex env add dev --url https://dev.example.com/admin-api --api-key sk-1234

# List products
vex product list

# Create a customer
vex customer create --email john@example.com --first-name John --last-name Doe

# Run any GraphQL query
vex query '{ products { items { id name } totalItems } }'

# Fetch and cache the schema
vex schema fetch
```

## CLI reference

### Environment management

```bash
vex env add <name> --url <url> --api-key <key>   # Add environment
                   [--schema-type endpoint|file]   # Schema source type
                   [--schema-value <value>]         # Introspection URL or file path
                   [--fetch-schema]                 # Fetch schema immediately
vex env list                                       # List all environments
vex env switch <name>                              # Switch active environment
vex env set <name> [--url <url>] [--api-key <key>] # Update environment fields
vex env remove <name>                              # Remove environment
vex env show [name]                                # Show environment details
```

### Schema

```bash
vex schema fetch [--env <name>]     # Fetch and cache GraphQL schema
```

### Generic GraphQL

```bash
vex query '<graphql>' [--variables '<json>']    # Run any query
vex mutate '<graphql>' [--variables '<json>']   # Run any mutation
```

### Customers

```bash
vex customer list [--take <n>] [--skip <n>] [--email <filter>] [--name <filter>]
vex customer get <id>
vex customer create --email <email> --first-name <name> --last-name <name> [--phone <n>] [--title <t>]
vex customer update <id> [--email <email>] [--first-name <name>] [--last-name <name>] [--phone <n>]
vex customer delete <id>
vex customer add-note <id> --note <text> [--public]
```

### Products

```bash
vex product list [--take <n>] [--skip <n>] [--name <filter>]
vex product get <id>
vex product create --name <name> --slug <slug> --description <desc> [--facet-value-ids <id,id>]
vex product update <id> [--name <name>] [--slug <slug>] [--description <desc>] [--enabled|--disabled]
vex product delete <id>
vex product add-variants <productId> --variants '<json>'
```

### Orders

```bash
vex order list [--take <n>] [--skip <n>] [--code <filter>]
vex order get <id>
vex order create-draft
vex order add-item <orderId> --variant <variantId> --quantity <n>
vex order set-customer <orderId> --customer <customerId>
vex order transition <id> --state <state>
vex order cancel <id> [--reason <reason>]
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

Running `vex` with no arguments starts the MCP server on stdio — this is what MCP clients expect.

Once connected, ask Claude:

> Add my Vendure dev server at https://dev.example.com/admin-api with API key sk-1234

Then you can use natural language:

> Create me a dummy order for product "shoes"

Claude will check if the product exists, create it if needed, find or create a customer, create a draft order, and add items — all by chaining the MCP tools automatically.

### Available MCP tools

When used as an MCP server, vex exposes 23 tools:

| Tool | Description |
|------|-------------|
| `vendure_setup` | Add, remove, list, switch, set, or show environments |
| `vendure_refetch_schema` | Re-fetch and cache the GraphQL schema |
| `vendure_query` | Execute any GraphQL query |
| `vendure_mutate` | Execute any GraphQL mutation |
| `vendure_get_customers` | List customers with filters |
| `vendure_get_customer` | Get customer by ID with addresses and orders |
| `vendure_create_customer` | Create a customer |
| `vendure_update_customer` | Update a customer |
| `vendure_delete_customer` | Delete a customer |
| `vendure_add_customer_note` | Add a note to a customer |
| `vendure_get_products` | List products with filters |
| `vendure_get_product` | Get product by ID with variants and facets |
| `vendure_create_product` | Create a product |
| `vendure_update_product` | Update a product |
| `vendure_delete_product` | Delete a product |
| `vendure_create_product_variants` | Create variants for a product |
| `vendure_get_orders` | List orders with filters |
| `vendure_get_order` | Get order by ID with lines and payments |
| `vendure_create_draft_order` | Create a draft order |
| `vendure_add_item_to_draft_order` | Add item to a draft order |
| `vendure_set_customer_for_draft_order` | Assign customer to a draft order |
| `vendure_transition_order` | Transition order state |
| `vendure_cancel_order` | Cancel an order |

## Configuration

Environments are stored at `~/.vendure-vex/config.json`. Each has:

- **url** — Vendure Admin API endpoint
- **apiKey** — sent as the `vendure-api-key` header
- **schemaSource** (optional) — `"endpoint"` to introspect, or `"file"` to load local SDL

Cached schemas live at `~/.vendure-vex/schemas/`.

## Development

```bash
npm install
npm run build        # Compile to dist/
npm run dev          # Run with tsx (no build)
npm run typecheck    # Type check only
```

## License

MIT

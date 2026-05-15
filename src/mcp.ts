/**
 * @module mcp
 *
 * Initializes the MCP (Model Context Protocol) server over stdio transport.
 * Registers all Vendure entity tools and optionally exposes the cached
 * GraphQL schema as an MCP resource.
 */

import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerSetupTool } from "./tools/setup.js";
import { registerRefetchSchemaTool } from "./tools/refetch-schema.js";
import { registerQueryTool } from "./tools/query.js";
import { registerMutateTool } from "./tools/mutate.js";
import { registerCustomerTools } from "./tools/customers.js";
import { registerProductTools } from "./tools/products.js";
import { registerOrderTools } from "./tools/orders.js";
import { registerZoneTools } from "./tools/zones.js";
import { registerTaxTools } from "./tools/tax.js";
import { registerChannelTools } from "./tools/channels.js";
import { registerSchemaIntrospectionTools } from "./tools/schemaIntrospection.js";
import { registerFragmentTools } from "./tools/fragments.js";
import { registerOperationTools } from "./tools/operations.js";
import { loadConfig } from "./config.js";
import { loadSchema } from "./schema.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

/**
 * Server-level instructions sent in the MCP `initialize` response. MCP clients
 * (e.g. Claude Code, Claude Desktop) inject this into the assistant's system
 * prompt at session start, so this is the canonical place to teach the model
 * how to drive vex's tools effectively.
 */
const SERVER_INSTRUCTIONS = `
vex exposes the Vendure Admin GraphQL API as MCP tools, including custom plugin extensions.

No interactive authentication or login flow is required — vex authenticates to Vendure via the API key stored in the active environment (sent as the \`vendure-api-key\` header on every request). If a tool returns an auth error, the key is missing, wrong, or revoked; ask the user to update it via \`vex_setup\` rather than initiating a login.

If \`vex_setup\` action="show" reports no active env, ask the user for URL + API key and add one. The cached schema lives at the resource \`vendure://schema/<envName>\`; call \`vex_refetch_schema\` if stale.

# Choosing the right tool
Pick the highest-level tool that matches the user's request:
- **Typed CRUD tools** (\`vex_get_customers\`, \`vex_create_product\`,
  \`vex_transition_order\`, \`vex_get_channels\`, \`vex_get_tax_rates\`, etc.)
  are the preferred path for standard Vendure entities. They validate input
  with Zod and return shaped JSON.
- **Schema introspection** (\`vex_list_operations\`, \`vex_describe_operation\`,
  \`vex_describe_type\`, \`vex_list_custom_fields\`) — use to discover what is
  available before falling back to raw GraphQL. \`vex_list_operations\` here
  lists operations on the **schema**; do not confuse it with
  \`vex_list_saved_operations\` (replayable queries the user has saved).
- **Raw GraphQL** (\`vex_query\`, \`vex_mutate\`) — escape hatch for custom
  plugin operations or anything the typed tools don't cover. Always read the
  schema resource first so the document is correct.

# Reusable queries
- **Fragments** (\`vex_list_fragments\`, \`vex_save_fragment\`,
  \`vex_get_fragment\`, \`vex_delete_fragment\`) are reusable selection sets on
  a specific type. Reach for them when you keep rewriting the same field list.
- **Saved operations** (\`vex_list_saved_operations\`, \`vex_get_saved_operation\`,
  \`vex_run_saved_operation\`, \`vex_delete_saved_operation\`) are full queries
  or mutations persisted with their default variables. \`vex_run_saved_operation\`
  re-executes a saved one with optional \`variableOverrides\` (shallow-merge into
  defaults) or \`replaceVariables\` (full replacement). Save operations the user
  is likely to repeat.

# Vendure quick reference
Mutations often return unions (\`Entity | ErrorResult\`) — branch on the response and surface \`errorCode\`/\`message\` from the error branch. List queries take \`ListOptions { take, skip, filter, sort }\`; default to small \`take\` (~10). Filter values use real JSON types (\`true\` not \`"true"\`, \`10\` not \`"10"\`). Never echo full API keys back to the user.
`;

/**
 * Registers the cached GraphQL SDL as a readable MCP resource
 * at `vendure://schema/{envName}`.
 */
function registerSchemaResource(
  server: McpServer,
  envName: string,
  sdl: string
): void {
  server.resource(
    `vendure-schema-${envName}`,
    `vendure://schema/${envName}`,
    {
      description: `GraphQL schema for Vendure environment "${envName}"`,
      mimeType: "text/plain",
    },
    async () => ({
      contents: [
        {
          uri: `vendure://schema/${envName}`,
          text: sdl,
          mimeType: "text/plain",
        },
      ],
    })
  );
}

/**
 * Starts the MCP server on stdio, registers all tools, and attempts
 * to load the active environment's schema as a resource.
 */
export async function startMcpServer(): Promise<void> {
  const server = new McpServer(
    {
      name: "vendure-vex",
      version,
    },
    {
      instructions: SERVER_INSTRUCTIONS,
    }
  );

  registerSetupTool(server);
  registerRefetchSchemaTool(server);
  registerQueryTool(server);
  registerMutateTool(server);
  registerCustomerTools(server);
  registerProductTools(server);
  registerOrderTools(server);
  registerZoneTools(server);
  registerTaxTools(server);
  registerChannelTools(server);
  registerSchemaIntrospectionTools(server);
  registerFragmentTools(server);
  registerOperationTools(server);

  // Try to load schema on startup and expose it as a resource.
  // Failures are expected on first run or when no environment is configured.
  try {
    const config = await loadConfig();
    const envName = config.activeEnvironment;
    const env = config.environments[envName];
    if (env) {
      try {
        const sdl = await loadSchema(env, envName);
        if (sdl) {
          registerSchemaResource(server, envName, sdl);
        }
      } catch {
        // Schema not available yet — the user can fetch it later via vex_refetch_schema
      }
    }
  } catch {
    // No config yet — normal on first run
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("vendure-vex MCP server running on stdio");
}

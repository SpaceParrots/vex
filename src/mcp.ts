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
import { registerAssetTools } from "./tools/assets.js";
import { registerSchemaIntrospectionTools } from "./tools/schemaIntrospection.js";
import { registerFragmentTools } from "./tools/fragments.js";
import { registerOperationTools } from "./tools/operations.js";
import { registerCurrentEnvTool } from "./tools/current-env.js";
import { loadConfig } from "./config.js";
import { loadSchema } from "./schema.js";
import { VEX_TOOLS_ENV, VEX_TOOLS_LEAN_VALUES } from "./constants.js";

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

# Action-dispatch tools
Most tools take an \`action\` parameter that selects the operation; each tool's description lists its valid actions and the fields each one needs. Set \`action\` first, then supply only that action's fields. Example: \`vex_customers {action:"list", filterByEmail:"…"}\` or \`vex_products {action:"get", id:"…"}\`.

# Choosing the environment
Most tools accept an optional \`env\` param to target a specific environment for that call; without it, vex uses \`VEX_ENV\` (set per project) and then the active environment. (\`vex_setup\` edits config directly, and \`vex_refetch_schema\` takes an explicit \`environment\` name.) Call \`vex_current_env\` to see which environment is currently in use.

# Choosing the right tool
Pick the highest-level tool that matches the user's request:
- **Typed entity tools** (\`vex_customers\`, \`vex_products\`, \`vex_orders\`,
  \`vex_zones\`, \`vex_tax\`, \`vex_channels\`) are the preferred path for standard
  Vendure entities. They validate input with Zod and return shaped JSON.
- **Schema discovery** (\`vex_schema\` with action \`list_operations\`,
  \`describe_operation\`, \`describe_type\`, or \`list_custom_fields\`) — use to
  discover what's available before falling back to raw GraphQL. This lists
  operations on the **schema**; don't confuse it with \`vex_operations\`
  (replayable queries the user has saved).
- **Raw GraphQL** (\`vex_query\`, \`vex_mutate\`) — escape hatch for custom plugin
  operations or anything the typed tools don't cover. Read the schema resource
  or use \`vex_schema\` first so the document is correct.

# Reusable queries
- **Fragments** (\`vex_fragments\` with action \`list\`/\`get\`/\`save\`/\`delete\`)
  are reusable selection sets on a specific type. Reach for them when you keep
  rewriting the same field list.
- **Saved operations** (\`vex_operations\` with action \`list\`/\`get\`/\`run\`/\`delete\`)
  are full queries or mutations persisted with their default variables.
  \`action:"run"\` re-executes one with optional \`variableOverrides\`
  (shallow-merge into defaults) or \`replaceVariables\` (full replacement). Save
  operations the user is likely to repeat.

# Lean mode
When started with the env var \`VEX_TOOLS=lean\`, only the universal interface is
exposed (\`vex_setup\`, \`vex_current_env\`, \`vex_refetch_schema\`, \`vex_query\`,
\`vex_mutate\`, \`vex_schema\`). Drive everything via \`vex_schema\` discovery plus
raw \`vex_query\`/\`vex_mutate\`.

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

/** Returns true when `VEX_TOOLS` selects the minimal ("lean") tool surface. */
function isLeanMode(): boolean {
  const mode = (process.env[VEX_TOOLS_ENV] ?? "full").trim().toLowerCase();
  return (VEX_TOOLS_LEAN_VALUES as readonly string[]).includes(mode);
}

/**
 * Registers MCP tools according to `VEX_TOOLS`. The universal interface (env
 * management, raw GraphQL, schema discovery) is always registered; the typed
 * entity tools and saved-query stores are added only in full mode. Skipping
 * them in lean mode removes ~8 tool definitions from the per-session context.
 */
function registerTools(server: McpServer, lean: boolean): void {
  // Universal interface — always available.
  registerSetupTool(server);
  registerCurrentEnvTool(server);
  registerRefetchSchemaTool(server);
  registerQueryTool(server);
  registerMutateTool(server);
  registerSchemaIntrospectionTools(server);

  if (lean) return;

  // Typed entity tools + reusable query stores (full mode only).
  registerCustomerTools(server);
  registerProductTools(server);
  registerOrderTools(server);
  registerZoneTools(server);
  registerTaxTools(server);
  registerChannelTools(server);
  registerAssetTools(server);
  registerFragmentTools(server);
  registerOperationTools(server);
}

/**
 * Starts the MCP server on stdio, registers tools (honoring `VEX_TOOLS`), and
 * attempts to load the active environment's schema as a resource.
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

  const lean = isLeanMode();
  registerTools(server, lean);

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
  console.error(`vendure-vex MCP server running on stdio (${lean ? "lean" : "full"} tools)`);
}

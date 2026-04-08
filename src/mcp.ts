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
import { loadConfig } from "./config.js";
import { loadSchema } from "./schema.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

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
  const server = new McpServer({
    name: "vendure-vex",
    version,
  });

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

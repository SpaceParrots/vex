#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerSetupTool } from "./tools/setup.js";
import { registerRefetchSchemaTool } from "./tools/refetch-schema.js";
import { registerQueryTool } from "./tools/query.js";
import { registerMutateTool } from "./tools/mutate.js";
import { registerCustomerTools } from "./tools/customers.js";
import { registerProductTools } from "./tools/products.js";
import { registerOrderTools } from "./tools/orders.js";
import { loadConfig } from "./config.js";
import { loadSchema, refetchSchema } from "./schema.js";

const server = new McpServer({
  name: "vendure-vex",
  version: "0.1.0",
});

// Register all tools
registerSetupTool(server);
registerRefetchSchemaTool(server);
registerQueryTool(server);
registerMutateTool(server);
registerCustomerTools(server);
registerProductTools(server);
registerOrderTools(server);

// Try to load schema on startup and expose it as a resource
async function initSchema(): Promise<void> {
  try {
    const config = await loadConfig();
    const envName = config.activeEnvironment;
    const env = config.environments[envName];
    if (!env) return;

    let sdl: string | undefined;
    try {
      sdl = await loadSchema(env, envName);
    } catch {
      // Schema not available yet — that's fine
    }

    if (sdl) {
      registerSchemaResource(envName, sdl);
    }
  } catch {
    // No config yet — normal on first run
  }
}

function registerSchemaResource(envName: string, sdl: string): void {
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

async function main(): Promise<void> {
  await initSchema();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("vendure-vex MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

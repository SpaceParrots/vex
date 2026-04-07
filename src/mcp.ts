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
import { loadSchema } from "./schema.js";

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

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: "vendure-vex",
    version: "0.2.0",
  });

  registerSetupTool(server);
  registerRefetchSchemaTool(server);
  registerQueryTool(server);
  registerMutateTool(server);
  registerCustomerTools(server);
  registerProductTools(server);
  registerOrderTools(server);

  // Try to load schema on startup and expose it as a resource
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
        // Schema not available yet — that's fine
      }
    }
  } catch {
    // No config yet — normal on first run
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("vendure-vex MCP server running on stdio");
}

/**
 * @module tools/env-aware
 *
 * Shared `env` parameter and a registration wrapper that makes any MCP tool
 * honor per-call environment targeting. `envAwareTool` injects the `env` param
 * into the tool's input schema and runs the handler inside `withEnv`, so the
 * tool (and every service it calls) resolves the requested environment.
 */

import { z, type ZodRawShape } from "zod";
import type { McpServer, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withEnv } from "../context.js";

/** Shared optional `env` parameter. Description kept terse to limit token cost. */
export const envParam = {
  env: z
    .string()
    .optional()
    .describe("Target env name (default: VEX_ENV, else active)."),
};

/**
 * Registers an MCP tool that accepts an optional `env` parameter and executes
 * its handler against the resolved environment.
 */
export function envAwareTool<Shape extends ZodRawShape>(
  server: McpServer,
  name: string,
  description: string,
  shape: Shape,
  cb: ToolCallback<Shape>
): void {
  const fullShape = { ...shape, ...envParam };
  const wrapped: ToolCallback<typeof fullShape> = ((args, extra) =>
    withEnv(args.env as string | undefined, async () =>
      (cb as (a: unknown, e: unknown) => unknown)(args, extra)
    )) as ToolCallback<typeof fullShape>;
  server.tool(name, description, fullShape, wrapped);
}

/**
 * @module tools/action-tool
 *
 * Helper for registering a single MCP tool that dispatches over an `action`
 * discriminator instead of exposing one tool per operation. Consolidating a
 * domain's operations into one action-dispatch tool dramatically shrinks the
 * always-on tool-definition surface that MCP clients load into context every
 * session (fewer tool names, descriptions, and injected `env` params).
 *
 * MCP requires every tool's top-level `inputSchema` to be an `object`, so a
 * root discriminated union is not viable. Instead the merged input shape is a
 * flat object: a required `action` enum plus the union of every action's
 * fields (all made optional). Per-action requiredness is re-applied at call
 * time by validating the incoming args against the chosen action's own schema,
 * so callers still get precise "missing field X for action Y" errors.
 *
 * Business logic stays in `src/services/*`; each action's handler is a thin
 * wrapper, exactly like the per-tool handlers it replaces.
 */

import { z, type ZodRawShape, type ZodTypeAny } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toVexError } from "../errors.js";
import { envAwareTool } from "./env-aware.js";

/**
 * MCP text-content tool result, compatible with `jsonContent()` and raw SDL
 * handlers. Declared as a `type` (not an `interface`) so it carries the implicit
 * index signature the SDK's `CallToolResult` requires.
 */
export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

/** One operation exposed by an action-dispatch tool. */
export interface ActionDef {
  /** One-line summary, listed under the tool description so the model knows what each action does. */
  readonly summary: string;
  /** Zod field shape for this action's parameters (excluding the shared `action`/`env` fields). */
  readonly shape: ZodRawShape;
  /** Handler invoked with the args validated against {@link ActionDef.shape}. */
  readonly handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

/** Map of action name → definition. */
export type ActionMap = Record<string, ActionDef>;

function errorResult(text: string): ToolResult {
  return { content: [{ type: "text" as const, text }], isError: true };
}

/**
 * Converts any thrown value into a uniform MCP error result: the normalized
 * message, plus a `Hint:` line when the error carries one. Shared by all tool
 * handlers so failures render identically across the tool surface.
 */
export function toolErrorResult(err: unknown): ToolResult {
  const vexErr = toVexError(err);
  return errorResult(vexErr.hint ? `${vexErr.message}\nHint: ${vexErr.hint}` : vexErr.message);
}

/**
 * Merges every action's field shape into one flat shape, making each field
 * optional (any single call only supplies one action's subset). When two
 * actions share a field name the later definition wins — keep shared fields
 * (e.g. `id`) described consistently across actions.
 */
function mergeShapes(actions: ActionMap): ZodRawShape {
  const merged: ZodRawShape = {};
  for (const def of Object.values(actions)) {
    for (const [key, zodType] of Object.entries(def.shape)) {
      const t = zodType as ZodTypeAny;
      merged[key] = t.isOptional() ? t : t.optional();
    }
  }
  return merged;
}

/** Builds the tool description: the domain summary plus a one-line catalog of actions. */
function buildDescription(base: string, actions: ActionMap): string {
  const lines = Object.entries(actions).map(([name, def]) => `- ${name}: ${def.summary}`);
  return `${base}\n\nActions:\n${lines.join("\n")}`;
}

/**
 * Validates `args` against the requested action's schema and invokes its
 * handler. Returns an `isError` result for an unknown action or invalid input
 * rather than throwing, so the model gets actionable feedback. Exported for
 * unit testing without spinning up an MCP server.
 */
export async function dispatchAction(
  actions: ActionMap,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const action = args.action;
  if (typeof action !== "string" || !Object.hasOwn(actions, action)) {
    const valid = Object.keys(actions).join(", ");
    return errorResult(`Unknown action "${String(action)}". Valid actions: ${valid}.`);
  }

  // z.object strips unknown keys, so `action`, `env`, and other actions'
  // fields are dropped — the handler receives only this action's parameters.
  const parsed = z.object(actions[action].shape).safeParse(args);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return errorResult(`Invalid input for action "${action}": ${issues}`);
  }

  try {
    return await actions[action].handler(parsed.data as Record<string, unknown>);
  } catch (err) {
    return toolErrorResult(err);
  }
}

/**
 * Registers an env-aware MCP tool that dispatches over an `action` field.
 *
 * @param server - The MCP server to register on.
 * @param name - Tool name (e.g. `vex_customers`).
 * @param description - Domain-level summary; the per-action catalog is appended automatically.
 * @param actions - Map of action name → {@link ActionDef}.
 */
export function actionTool(
  server: McpServer,
  name: string,
  description: string,
  actions: ActionMap
): void {
  const actionNames = Object.keys(actions);
  if (actionNames.length === 0) {
    throw new Error(`actionTool("${name}") requires at least one action`);
  }
  const shape: ZodRawShape = {
    action: z
      .enum(actionNames as [string, ...string[]])
      .describe("Operation to perform; see description for valid values."),
    ...mergeShapes(actions),
  };

  envAwareTool(
    server,
    name,
    buildDescription(description, actions),
    shape,
    async (input) => dispatchAction(actions, input as Record<string, unknown>)
  );
}

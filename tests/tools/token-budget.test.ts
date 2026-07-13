import { describe, it, expect } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodTypeAny } from "zod";
import { registerTools } from "../../src/mcp.js";

interface RecordedTool {
  readonly name: string;
  readonly description: string;
  readonly shape: Record<string, ZodTypeAny>;
}

/** Minimal McpServer stand-in that records tool registrations. */
function recordingServer(recorded: RecordedTool[]): McpServer {
  return {
    tool: (name: string, description: string, shape: Record<string, ZodTypeAny>) => {
      recorded.push({ name, description, shape });
    },
  } as unknown as McpServer;
}

/**
 * Approximates the always-on context cost of the registered tools: tool
 * names + descriptions + every parameter name and description. (JSON-schema
 * scaffolding adds a roughly constant factor on top.)
 */
function measure(recorded: readonly RecordedTool[]): number {
  return recorded.reduce((sum, t) => {
    const paramChars = Object.entries(t.shape).reduce(
      (s, [key, zodType]) => s + key.length + (zodType.description?.length ?? 0),
      0
    );
    return sum + t.name.length + t.description.length + paramChars;
  }, 0);
}

// Ceilings: measured post-trim baseline (full: 9975, lean: 2410) + ~10% headroom,
// rounded up to the nearest 500.
const FULL_CEILING = 11_000;
const LEAN_CEILING = 3_000;

describe("MCP tool-definition token budget", () => {
  it(`full mode stays under ${FULL_CEILING} chars`, () => {
    const recorded: RecordedTool[] = [];
    registerTools(recordingServer(recorded), false);
    const size = measure(recorded);
    expect(size, `full-mode tool surface is ${size} chars`).toBeLessThanOrEqual(FULL_CEILING);
  });

  it(`lean mode stays under ${LEAN_CEILING} chars`, () => {
    const recorded: RecordedTool[] = [];
    registerTools(recordingServer(recorded), true);
    const size = measure(recorded);
    expect(size, `lean-mode tool surface is ${size} chars`).toBeLessThanOrEqual(LEAN_CEILING);
  });
});

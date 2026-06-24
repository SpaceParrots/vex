import { describe, it, expect } from "vitest";
import { z } from "zod";
import { dispatchAction, type ActionMap } from "../../src/tools/action-tool.js";

/** A small two-action map: `greet` (required `name`) and `count` (optional `n`). */
function makeActions(calls: string[]): ActionMap {
  return {
    greet: {
      summary: "Greet someone.",
      shape: { name: z.string().describe("Who to greet") },
      handler: async (a) => {
        calls.push(`greet:${String(a.name)}`);
        return { content: [{ type: "text" as const, text: `hi ${String(a.name)}` }] };
      },
    },
    count: {
      summary: "Count optionally.",
      shape: { n: z.number().optional().describe("A number") },
      handler: async (a) => {
        calls.push(`count:${String(a.n ?? 0)}`);
        return { content: [{ type: "text" as const, text: `n=${String(a.n ?? 0)}` }] };
      },
    },
  };
}

describe("dispatchAction", () => {
  it("validates and dispatches the matching action", async () => {
    const calls: string[] = [];
    const res = await dispatchAction(makeActions(calls), { action: "greet", name: "Ada" });
    expect(res.isError).toBeUndefined();
    expect(res.content[0].text).toBe("hi Ada");
    expect(calls).toEqual(["greet:Ada"]);
  });

  it("strips foreign keys (action/env/other-action fields) before calling the handler", async () => {
    const calls: string[] = [];
    const res = await dispatchAction(makeActions(calls), {
      action: "count",
      n: 3,
      env: "prod",
      name: "ignored",
    });
    expect(res.content[0].text).toBe("n=3");
    expect(calls).toEqual(["count:3"]);
  });

  it("returns an isError result for an unknown action without throwing", async () => {
    const calls: string[] = [];
    const res = await dispatchAction(makeActions(calls), { action: "nope" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Unknown action "nope"/);
    expect(res.content[0].text).toMatch(/greet, count/);
    expect(calls).toEqual([]);
  });

  it("returns an isError result listing the missing required field", async () => {
    const calls: string[] = [];
    const res = await dispatchAction(makeActions(calls), { action: "greet" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Invalid input for action "greet"/);
    expect(res.content[0].text).toMatch(/name/);
    expect(calls).toEqual([]);
  });

  it("returns an isError result when a field has the wrong type", async () => {
    const calls: string[] = [];
    const res = await dispatchAction(makeActions(calls), { action: "count", n: "not-a-number" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Invalid input for action "count"/);
    expect(calls).toEqual([]);
  });

  it("treats a missing/non-string action as unknown", async () => {
    const calls: string[] = [];
    const res = await dispatchAction(makeActions(calls), {});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Unknown action/);
  });
});

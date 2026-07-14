import { describe, it, expect } from "vitest";
import { z } from "zod";
import { dispatchAction, type ActionMap } from "../../src/tools/action-tool.js";
import { PermissionError } from "../../src/errors.js";

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

  it("treats inherited keys like 'toString' as unknown actions (no throw)", async () => {
    const calls: string[] = [];
    const res = await dispatchAction(makeActions(calls), { action: "toString" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Unknown action/);
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

describe("dispatchAction error presentation", () => {
  it("converts a thrown VexError into an isError result with the hint", async () => {
    const actions = {
      boom: {
        summary: "always throws",
        shape: {},
        handler: async () => {
          throw new PermissionError("Permission denied for `createProduct` on env \"dev\".", {
            hint: "Run `vex schema permissions`.",
          });
        },
      },
    };
    const result = await dispatchAction(actions, { action: "boom" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Permission denied");
    expect(result.content[0].text).toContain("Hint: Run `vex schema permissions`.");
  });

  it("normalizes non-Vex throws via toVexError", async () => {
    const actions = {
      boom: {
        summary: "throws plain",
        shape: {},
        handler: async () => {
          throw new Error("plain failure");
        },
      },
    };
    const result = await dispatchAction(actions, { action: "boom" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("plain failure");
  });
});

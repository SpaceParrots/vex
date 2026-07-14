import { describe, it, expect } from "vitest";
import { expandShortcuts } from "../src/cli.js";

describe("expandShortcuts", () => {
  it("expands plural list shortcuts preserving trailing flags", () => {
    expect(expandShortcuts(["node", "vex", "products", "--take", "5"])).toEqual([
      "node",
      "vex",
      "product",
      "list",
      "--take",
      "5",
    ]);
  });

  it("expands `use` to env switch", () => {
    expect(expandShortcuts(["node", "vex", "use", "staging"])).toEqual([
      "node",
      "vex",
      "env",
      "switch",
      "staging",
    ]);
  });

  it("returns argv unchanged when no shortcut matches", () => {
    const argv = ["node", "vex", "product", "list"];
    expect(expandShortcuts(argv)).toEqual(argv);
  });

  it("handles empty argv tails", () => {
    expect(expandShortcuts(["node", "vex"])).toEqual(["node", "vex"]);
  });
});

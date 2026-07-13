import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@clack/prompts", () => ({
  isCancel: vi.fn(),
  cancel: vi.fn(),
}));

import { isCancel, cancel } from "@clack/prompts";
import { cancelAndExit, unwrapCancel } from "../src/prompt.js";

describe("cancelAndExit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("prints the clack cancel notice and exits with code 130", () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    expect(() => cancelAndExit("Cancelled. No environment added.")).toThrow("process.exit called");
    expect(cancel).toHaveBeenCalledWith("Cancelled. No environment added.");
    expect(exitSpy).toHaveBeenCalledWith(130);
    exitSpy.mockRestore();
  });

  it("defaults the message to 'Cancelled.'", () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    expect(() => cancelAndExit()).toThrow("process.exit called");
    expect(cancel).toHaveBeenCalledWith("Cancelled.");
    exitSpy.mockRestore();
  });
});

describe("unwrapCancel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the value unchanged when it is not a cancel symbol", () => {
    vi.mocked(isCancel).mockReturnValue(false);
    expect(unwrapCancel("hello")).toBe("hello");
    expect(unwrapCancel(42)).toBe(42);
  });

  it("reaches cancelAndExit (cancel + process.exit(130)) when the value is a cancel symbol", () => {
    vi.mocked(isCancel).mockReturnValue(true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const cancelSymbol = Symbol("clack-cancel");
    expect(() => unwrapCancel(cancelSymbol, "Cancelled. No request sent.")).toThrow(
      "process.exit called"
    );
    expect(cancel).toHaveBeenCalledWith("Cancelled. No request sent.");
    expect(exitSpy).toHaveBeenCalledWith(130);
    exitSpy.mockRestore();
  });
});

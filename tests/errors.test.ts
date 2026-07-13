import { describe, it, expect } from "vitest";
import {
  VexError,
  ConfigError,
  NoEnvironmentError,
  EnvNotFoundError,
  NetworkError,
  GraphQLRequestError,
  PermissionError,
  toVexError,
  isErrnoException,
} from "../src/errors.js";

/** graphql-request ClientError-shaped fixture. */
function clientError(
  errors: Array<{ message: string; extensions?: { code?: string }; path?: Array<string | number> }>,
  status = 200
) {
  return { response: { status, errors }, message: "raw client error with full query echoed" };
}

describe("VexError", () => {
  it("carries code, hint, and cause", () => {
    const cause = new Error("underlying");
    const err = new VexError("boom", { hint: "try again", cause });
    expect(err.code).toBe("VEX_ERROR");
    expect(err.hint).toBe("try again");
    expect((err as Error & { cause?: unknown }).cause).toBe(cause);
    expect(err.name).toBe("VexError");
  });
  it("gives config and environment errors their own codes", () => {
    const config = new ConfigError("config is corrupt", { hint: "delete the file" });
    expect(config.code).toBe("CONFIG");
    expect(config.name).toBe("ConfigError");
    expect(config.hint).toBe("delete the file");

    const noEnv = new NoEnvironmentError("no environment configured");
    expect(noEnv.code).toBe("NO_ENV");
    expect(noEnv.name).toBe("NoEnvironmentError");

    const notFound = new EnvNotFoundError('environment "staging" not found');
    expect(notFound.code).toBe("ENV_NOT_FOUND");
    expect(notFound.name).toBe("EnvNotFoundError");
  });
});

describe("toVexError", () => {
  it("passes through existing VexErrors unchanged", () => {
    const original = new NetworkError("down");
    expect(toVexError(original)).toBe(original);
  });

  it("compacts GraphQL errors into a GraphQLRequestError without echoing the request body", () => {
    const err = toVexError(
      clientError(
        [{ message: "no such field", extensions: { code: "GRAPHQL_VALIDATION_FAILED" }, path: ["products"] }],
        400
      )
    );
    expect(err).toBeInstanceOf(GraphQLRequestError);
    expect(err.message).toBe("HTTP 400 — no such field [GRAPHQL_VALIDATION_FAILED] @ products");
    expect((err as GraphQLRequestError).status).toBe(400);
    expect((err as GraphQLRequestError).errors).toEqual([
      { message: "no such field", code: "GRAPHQL_VALIDATION_FAILED", path: "products" },
    ]);
    expect(err.message).not.toContain("full query");
  });

  it("upgrades FORBIDDEN errors to PermissionError with a default hint", () => {
    const err = toVexError(
      clientError([{ message: "You are not currently authorized to perform this action", extensions: { code: "FORBIDDEN" } }])
    );
    expect(err).toBeInstanceOf(PermissionError);
    expect((err as PermissionError).suggestedPermissions).toEqual([]);
    expect(err.hint).toContain("vex schema permissions");
  });

  it("maps connection failures to NetworkError with a hint", () => {
    const econn = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:3000"), { code: "ECONNREFUSED" });
    const err = toVexError(econn);
    expect(err).toBeInstanceOf(NetworkError);
    expect(err.message).toContain("ECONNREFUSED");
    expect(err.hint).toContain("vex status");
  });

  it("maps undici 'fetch failed' to NetworkError", () => {
    const err = toVexError(new TypeError("fetch failed"));
    expect(err).toBeInstanceOf(NetworkError);
  });

  it("does not treat a non-network errno code (e.g. EACCES) as a NetworkError", () => {
    const eacces = Object.assign(new Error("permission denied, open '/etc/shadow'"), { code: "EACCES" });
    const err = toVexError(eacces);
    expect(err).not.toBeInstanceOf(NetworkError);
    expect(err).toBeInstanceOf(VexError);
    expect(err.message).toBe(eacces.message);
  });

  it("wraps plain errors and non-errors as VexError", () => {
    expect(toVexError(new Error("plain"))).toBeInstanceOf(VexError);
    expect(toVexError("oops").message).toBe("oops");
  });

  it("handles a bare HTTP status with no GraphQL errors", () => {
    const err = toVexError({ response: { status: 502 } });
    expect(err).toBeInstanceOf(GraphQLRequestError);
    expect(err.message).toBe("HTTP 502");
  });
});

describe("isErrnoException", () => {
  it("returns true for an Error with a .code property", () => {
    const err = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    expect(isErrnoException(err)).toBe(true);
  });

  it("returns false for a plain Error without .code", () => {
    expect(isErrnoException(new Error("plain"))).toBe(false);
  });

  it("returns false for non-Error values", () => {
    expect(isErrnoException("oops")).toBe(false);
    expect(isErrnoException(null)).toBe(false);
    expect(isErrnoException(undefined)).toBe(false);
    expect(isErrnoException({ code: "EACCES" })).toBe(false);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createClient } from "../../src/client.js";
import { checkEndpoint } from "../../src/services/env.js";
import { toVexError } from "../../src/errors.js";

vi.mock("../../src/client.js", async (orig) => {
  const actual = await orig<typeof import("../../src/client.js")>();
  return { ...actual, createClient: vi.fn(actual.createClient) };
});

const env = { url: "https://shop.example/admin-api", apiKey: "key" };
const FIX_HINT = "check the key in the Vendure admin, then update it with `vex env set prod --api-key <new-key>`";

/** Builds the error `createClient` throws for a raw graphql-request ClientError. */
function clientError(status: number, errors?: ReadonlyArray<Record<string, unknown>>): Error {
  const raw = Object.assign(new Error("raw"), { response: { status, ...(errors ? { errors } : {}) } });
  return toVexError(raw);
}

/** Builds the error `createClient` throws when fetch fails with `cause`. */
function fetchFailure(cause: Error): Error {
  return toVexError(Object.assign(new TypeError("fetch failed"), { cause }));
}

describe("checkEndpoint (stubbed client)", () => {
  const request = vi.fn();

  beforeEach(() => {
    request.mockReset();
    vi.mocked(createClient).mockReturnValue({ request });
  });

  afterEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it("probes with a query that needs authentication and exists only in the Admin API", async () => {
    request.mockResolvedValue({ globalSettings: { id: "1" } });
    await checkEndpoint(env);
    expect(request).toHaveBeenCalledWith("{ globalSettings { id } }");
    expect(request).not.toHaveBeenCalledWith(expect.stringContaining("__typename"));
  });

  it("accepts the key when the probe succeeds", async () => {
    request.mockResolvedValue({ globalSettings: { id: "1" } });
    await expect(checkEndpoint(env)).resolves.toEqual({ ok: true, detail: "reachable, API key accepted" });
  });

  it("rejects the key when Vendure answers HTTP 200 with FORBIDDEN, naming the fix", async () => {
    request.mockRejectedValue(
      clientError(200, [
        {
          message: "You are not currently authorized to perform this action",
          path: ["globalSettings"],
          extensions: { code: "FORBIDDEN" },
        },
      ])
    );
    await expect(checkEndpoint(env, "prod")).resolves.toEqual({
      ok: false,
      detail: `reachable, but API key rejected (FORBIDDEN): ${FIX_HINT}`,
    });
  });

  it("rejects the key on an UNAUTHORIZED GraphQL error", async () => {
    request.mockRejectedValue(clientError(200, [{ message: "nope", extensions: { code: "UNAUTHORIZED" } }]));
    await expect(checkEndpoint(env, "prod")).resolves.toEqual({
      ok: false,
      detail: `reachable, but API key rejected (UNAUTHORIZED): ${FIX_HINT}`,
    });
  });

  it.each([401, 403])("rejects the key on HTTP %i", async (status) => {
    request.mockRejectedValue(clientError(status));
    await expect(checkEndpoint(env, "prod")).resolves.toEqual({
      ok: false,
      detail: `reachable, but API key rejected (HTTP ${status}): ${FIX_HINT}`,
    });
  });

  it("uses a <name> placeholder in the fix when no env name is given", async () => {
    request.mockRejectedValue(clientError(401));
    const result = await checkEndpoint(env);
    expect(result.detail).toContain("`vex env set <name> --api-key <new-key>`");
  });

  it("flags a Shop API URL, where the probe fails schema validation", async () => {
    request.mockRejectedValue(
      clientError(400, [
        {
          message: 'Cannot query field "globalSettings" on type "Query".',
          extensions: { code: "GRAPHQL_VALIDATION_FAILED" },
        },
      ])
    );
    await expect(checkEndpoint(env)).resolves.toEqual({
      ok: false,
      detail:
        "reachable, but not a Vendure Admin API (it does not serve globalSettings; is this the Shop API? Admin API URLs usually end in /admin-api)",
    });
  });

  it("points at the URL when the endpoint answers without a GraphQL response", async () => {
    request.mockRejectedValue(clientError(404));
    await expect(checkEndpoint(env)).resolves.toEqual({
      ok: false,
      detail: "endpoint answered HTTP 404 without a GraphQL response (check the URL)",
    });
  });

  it("does not claim the key is accepted when the probe fails for another GraphQL reason", async () => {
    request.mockRejectedValue(clientError(500, [{ message: "boom", extensions: { code: "INTERNAL_SERVER_ERROR" } }]));
    await expect(checkEndpoint(env)).resolves.toEqual({
      ok: false,
      detail: "reachable, but API key not verified (HTTP 500: boom [INTERNAL_SERVER_ERROR])",
    });
  });

  it("reports the transport error code when the endpoint is unreachable", async () => {
    const cause = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    request.mockRejectedValue(fetchFailure(cause));
    await expect(checkEndpoint(env)).resolves.toEqual({ ok: false, detail: "not reachable (ECONNREFUSED)" });
  });

  it("falls back to the innermost cause when no transport code is present", async () => {
    request.mockRejectedValue(fetchFailure(new Error("bad port")));
    await expect(checkEndpoint(env)).resolves.toEqual({ ok: false, detail: "not reachable (bad port)" });
  });

  it("reports any other failure by the first line of its message, capped in length", async () => {
    request.mockRejectedValue(toVexError(new Error(`${"x".repeat(200)}\nsecond line`)));
    await expect(checkEndpoint(env)).resolves.toEqual({
      ok: false,
      detail: `unexpected response (${"x".repeat(120)}...); check the URL`,
    });
  });
});

describe("checkEndpoint (real client, stubbed fetch)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Stubs fetch with one JSON response and returns the spy. */
  function respond(status: number, body: unknown) {
    return vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
    );
  }

  it("does not accept the key when a 200 JSON response carries no GraphQL data", async () => {
    respond(200, { status: "ok" });
    await expect(checkEndpoint(env, "prod")).resolves.toEqual({
      ok: false,
      detail: "endpoint answered without GraphQL data (check the URL)",
    });
  });

  it("keeps an HTML page out of the one-line detail", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<!doctype html>\n<html><body>app</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })
    );
    await expect(checkEndpoint(env, "prod")).resolves.toEqual({
      ok: false,
      detail: "endpoint did not answer with GraphQL JSON (check the URL)",
    });
  });

  it("rejects an invalid key that Vendure answers with HTTP 200 + FORBIDDEN", async () => {
    respond(200, {
      data: null,
      errors: [
        {
          message: "You are not currently authorized to perform this action",
          path: ["globalSettings"],
          extensions: { code: "FORBIDDEN" },
        },
      ],
    });
    const result = await checkEndpoint(env, "prod");
    expect(result).toEqual({ ok: false, detail: `reachable, but API key rejected (FORBIDDEN): ${FIX_HINT}` });
  });

  it("sends the probe to the env URL with the API key header", async () => {
    const fetchSpy = respond(200, { data: { globalSettings: { id: "1" } } });
    const result = await checkEndpoint(env, "prod");
    expect(result).toEqual({ ok: true, detail: "reachable, API key accepted" });
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(String(url)).toBe(env.url);
    expect(new Headers(init?.headers).get("vendure-api-key")).toBe("key");
  });
});

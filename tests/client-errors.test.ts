import { describe, it, expect, vi, afterEach } from "vitest";
import { createClient } from "../src/client.js";
import { GraphQLRequestError } from "../src/errors.js";

const ENV = { url: "https://x.example.com/admin-api", apiKey: "k" };

afterEach(() => vi.restoreAllMocks());

describe("createClient error normalization", () => {
  it("throws a compact GraphQLRequestError instead of the raw ClientError", async () => {
    const client = createClient(ENV);
    // Simulate graphql-request's ClientError shape from the underlying request.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ errors: [{ message: "denied", extensions: { code: "FORBIDDEN" } }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    await expect(client.request("{ __typename }")).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(GraphQLRequestError);
      expect((err as Error).message).toContain("denied");
      expect((err as Error).message).not.toContain("__typename");
      return true;
    });
  });
});

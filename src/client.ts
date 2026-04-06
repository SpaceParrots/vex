import { GraphQLClient } from "graphql-request";
import type { Environment } from "./config.js";

export function createClient(env: Environment): GraphQLClient {
  return new GraphQLClient(env.url, {
    headers: {
      "vendure-api-key": env.apiKey,
    },
  });
}

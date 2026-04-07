import { getActiveEnv } from "../config.js";
import { createClient } from "../client.js";

export async function executeQuery(
  query: string,
  variables?: Record<string, unknown>
): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);
  return client.request(query, variables);
}

export async function executeMutation(
  mutation: string,
  variables?: Record<string, unknown>
): Promise<unknown> {
  const { env } = await getActiveEnv();
  const client = createClient(env);
  return client.request(mutation, variables);
}

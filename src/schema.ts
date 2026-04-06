import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { getIntrospectionQuery, buildClientSchema, printSchema } from "graphql";
import { createClient } from "./client.js";
import { getSchemaPath, type Environment } from "./config.js";

async function introspect(env: Environment, endpoint?: string): Promise<string> {
  const client = createClient({
    ...env,
    url: endpoint ?? env.url,
  });
  const data = await client.request<Record<string, unknown>>(
    getIntrospectionQuery()
  );
  const schema = buildClientSchema(
    data as unknown as Parameters<typeof buildClientSchema>[0]
  );
  return printSchema(schema);
}

async function fetchSchema(
  env: Environment,
  envName: string
): Promise<string> {
  const schemaPath = getSchemaPath(envName);
  let sdl: string;

  if (env.schemaSource?.type === "file") {
    const filePath = env.schemaSource.value;
    if (!filePath) {
      throw new Error("Schema source type is 'file' but no path was provided.");
    }
    sdl = await readFile(filePath, "utf-8");
  } else {
    const endpoint = env.schemaSource?.value ?? undefined;
    sdl = await introspect(env, endpoint);
  }

  // Cache the schema
  await mkdir(dirname(schemaPath), { recursive: true });
  await writeFile(schemaPath, sdl, "utf-8");
  return sdl;
}

export async function loadSchema(
  env: Environment,
  envName: string
): Promise<string> {
  const schemaPath = getSchemaPath(envName);
  if (existsSync(schemaPath)) {
    return readFile(schemaPath, "utf-8");
  }
  if (!env.schemaSource) {
    throw new Error(
      `No schema source configured for environment "${envName}". ` +
        "Configure one via vendure_setup or use vendure_refetch_schema with an introspection endpoint."
    );
  }
  return fetchSchema(env, envName);
}

export async function refetchSchema(
  env: Environment,
  envName: string
): Promise<string> {
  if (!env.schemaSource) {
    // Default to introspecting the API URL
    const envWithSource: Environment = {
      ...env,
      schemaSource: { type: "endpoint" },
    };
    return fetchSchema(envWithSource, envName);
  }
  return fetchSchema(env, envName);
}

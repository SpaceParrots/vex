/**
 * @module wizard/envAdd
 *
 * Interactive wizard for `vex env add`. Prompts for any missing required
 * fields (URL, API key) and validates the connection by running a GraphQL
 * introspection query against the endpoint. Returns the input ready to be
 * passed to {@link addEnvironment}, or `null` if the user cancels.
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { intro, outro, text, password, select, confirm, isCancel, cancel, log, spinner } from "@clack/prompts";
import { buildSchema } from "graphql";
import type { Environment } from "../config.js";
import { introspect } from "../schema.js";

export interface EnvAddWizardInput {
  readonly name: string;
  readonly url?: string;
  readonly apiKey?: string;
  readonly schemaType?: "endpoint" | "file";
  readonly schemaValue?: string;
}

export interface EnvAddWizardResult {
  readonly name: string;
  readonly url: string;
  readonly apiKey: string;
  readonly schemaType?: "endpoint" | "file";
  readonly schemaValue?: string;
}

function bail(): never {
  cancel("Cancelled. No environment added.");
  process.exit(130);
}

function validateUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return "URL is required.";
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return "URL must use http:// or https://";
    }
  } catch {
    return "Invalid URL.";
  }
  return undefined;
}

function validateApiKey(value: string): string | undefined {
  if (!value || !value.trim()) return "API key is required.";
  return undefined;
}

async function promptUrl(initial?: string): Promise<string> {
  if (initial && !validateUrl(initial)) return initial.trim();
  const v = await text({
    message: "Vendure Admin API URL:",
    placeholder: "https://api.example.com/admin-api",
    initialValue: initial ?? "",
    validate: validateUrl,
  });
  if (isCancel(v)) bail();
  return String(v).trim();
}

async function promptApiKey(initial?: string): Promise<string> {
  if (initial && !validateApiKey(initial)) return initial;
  const v = await password({
    message: "Vendure API key (sent as `vendure-api-key` header):",
    validate: validateApiKey,
  });
  if (isCancel(v)) bail();
  return String(v);
}

async function promptSchemaSource(
  initialType?: "endpoint" | "file",
  initialValue?: string
): Promise<{ type?: "endpoint" | "file"; value?: string }> {
  if (initialType) return { type: initialType, value: initialValue };

  const choice = await select({
    message: "Schema source (used for introspection cache):",
    options: [
      { value: "default", label: "Endpoint (introspect this URL — default)" },
      { value: "custom", label: "Endpoint (custom URL)" },
      { value: "file", label: "Local SDL file" },
      { value: "skip", label: "Skip (configure later)" },
    ],
    initialValue: "default",
  });
  if (isCancel(choice)) bail();

  if (choice === "skip") return {};
  if (choice === "default") return { type: "endpoint" };

  if (choice === "custom") {
    const v = await text({
      message: "Custom introspection endpoint URL:",
      validate: validateUrl,
    });
    if (isCancel(v)) bail();
    return { type: "endpoint", value: String(v).trim() };
  }

  // file
  const v = await text({
    message: "Path to local SDL file:",
    placeholder: "/path/to/schema.graphql",
    validate: (val) => (val.trim() ? undefined : "Path is required."),
  });
  if (isCancel(v)) bail();
  return { type: "file", value: String(v).trim() };
}

async function validateViaIntrospection(env: Environment, endpoint?: string): Promise<string> {
  const s = spinner();
  s.start("Validating credentials by fetching schema…");
  try {
    const sdl = await introspect(env, endpoint);
    s.stop("Schema fetched successfully.");
    return sdl;
  } catch (err) {
    s.stop("Schema fetch failed.");
    throw err;
  }
}

async function validateViaFile(filePath: string): Promise<string> {
  const s = spinner();
  s.start(`Reading SDL file ${filePath}…`);
  try {
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    const sdl = await readFile(filePath, "utf-8");
    buildSchema(sdl);
    s.stop("SDL file parsed successfully.");
    return sdl;
  } catch (err) {
    s.stop("SDL file validation failed.");
    throw err;
  }
}

async function promptFilePath(initial?: string): Promise<string> {
  const v = await text({
    message: "Path to local SDL file:",
    placeholder: initial ?? "/path/to/schema.graphql",
    initialValue: initial ?? "",
    validate: (val) => (val.trim() ? undefined : "Path is required."),
  });
  if (isCancel(v)) bail();
  return String(v).trim();
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Runs the interactive `env add` wizard. Prompts for any missing required
 * fields and validates the connection by introspecting the schema. Allows
 * retrying credentials on failure.
 *
 * @returns The collected inputs and the fetched SDL (for caching), or
 *   exits the process if the user cancels.
 */
export async function runEnvAddWizard(
  input: EnvAddWizardInput
): Promise<{ result: EnvAddWizardResult; sdl: string }> {
  if (!process.stdout.isTTY) {
    throw new Error(
      "`vex env add` requires a TTY when --url or --api-key are missing. " +
        "Pass both flags explicitly to run non-interactively."
    );
  }

  intro(`vex env add — ${input.name}`);
  log.info(
    "Configure a Vendure Admin API environment. Your API key is sent only to the URL you provide."
  );

  let url = await promptUrl(input.url);
  let apiKey = await promptApiKey(input.apiKey);
  let schema = await promptSchemaSource(input.schemaType, input.schemaValue);

  let sdl = "";
  validation: while (true) {
    try {
      if (schema.type === "file") {
        if (!schema.value) schema = { type: "file", value: await promptFilePath() };
        sdl = await validateViaFile(schema.value as string);
      } else {
        const endpointOverride = schema.type === "endpoint" ? schema.value : undefined;
        sdl = await validateViaIntrospection({ url, apiKey }, endpointOverride);
      }
      break;
    } catch (err) {
      log.error(`Validation failed: ${errorMessage(err)}`);
      const options =
        schema.type === "file"
          ? [
              { value: "edit-file", label: "Pick a different SDL file" },
              { value: "switch-endpoint", label: "Switch to endpoint introspection" },
              { value: "save-anyway", label: "Save without validation" },
              { value: "abort", label: "Abort" },
            ]
          : [
              { value: "retry", label: "Retry with the same values" },
              { value: "edit-key", label: "Edit API key" },
              { value: "edit-url", label: "Edit URL" },
              { value: "switch-file", label: "Use a local SDL file instead" },
              { value: "save-anyway", label: "Save without validation" },
              { value: "abort", label: "Abort" },
            ];
      const next = await select({ message: "What now?", options });
      if (isCancel(next) || next === "abort") bail();
      if (next === "edit-key") apiKey = await promptApiKey();
      if (next === "edit-url") url = await promptUrl(url);
      if (next === "edit-file") {
        schema = { type: "file", value: await promptFilePath(schema.value) };
      }
      if (next === "switch-file") {
        schema = { type: "file", value: await promptFilePath() };
      }
      if (next === "switch-endpoint") {
        schema = { type: "endpoint" };
      }
      if (next === "save-anyway") {
        const sure = await confirm({
          message: "Save environment with unvalidated credentials?",
          initialValue: false,
        });
        if (isCancel(sure) || !sure) bail();
        sdl = "";
        break validation;
      }
    }
  }

  outro(`Validated. Environment "${input.name}" ready to save.`);

  return {
    result: {
      name: input.name,
      url,
      apiKey,
      schemaType: schema.type,
      schemaValue: schema.value,
    },
    sdl,
  };
}

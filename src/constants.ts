/** Default number of items per page for list operations. */
export const DEFAULT_PAGE_SIZE = 20;

/** Default number of items to skip for list operations. */
export const DEFAULT_SKIP = 0;

/** Page size for country list operations (larger since countries are a bounded set). */
export const COUNTRIES_PAGE_SIZE = 250;

/** Default language code used for Vendure translation fields. */
export const DEFAULT_LANGUAGE_CODE = "en";

/**
 * Environment variable selecting which MCP tool groups to register, controlling
 * the always-on tool-definition surface loaded into the client's context.
 * Unset or "full" registers every tool; "lean" (alias "minimal") registers only
 * the universal interface (setup, env, schema introspection, raw query/mutate).
 */
export const VEX_TOOLS_ENV = "VEX_TOOLS";

/** {@link VEX_TOOLS_ENV} values that select the minimal tool surface. */
export const VEX_TOOLS_LEAN_VALUES = ["lean", "minimal"] as const;

/** HTTP header name for Vendure API key authentication. */
export const API_KEY_HEADER = "vendure-api-key";

/** Number of leading characters to show when masking an API key. */
export const API_KEY_MASK_LENGTH = 4;

/** Suffix appended after the visible portion of a masked API key. */
export const API_KEY_MASK_SUFFIX = "****";

/** Default max depth for the wizard's flat path selector. */
export const DEFAULT_SELECTOR_MAX_DEPTH = 3;

/** Hard cap for the flat path selector's --max-depth flag. */
export const MAX_SELECTOR_DEPTH = 6;

/**
 * Variable-name patterns that look like they hold a secret. Saved-operation
 * tooling warns the user before persisting variables whose top-level keys
 * match these patterns, since saved operation files live unencrypted on disk.
 */
export const SENSITIVE_VAR_NAME_RE = /password|secret|token|apikey|api_key|credential|authorization|bearer/i;

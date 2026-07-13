/**
 * @module errors
 *
 * Typed error hierarchy for vex. Every error carries a machine-readable
 * `code` and an optional `hint` telling the user what to do next. Presenters
 * (CLI `handleError`, MCP `dispatchAction`) render message + hint uniformly;
 * services throw typed errors and never format output.
 *
 * This module must stay a leaf: it may not import config, client, or services.
 */

/** Options accepted by every {@link VexError} constructor. */
export interface VexErrorOptions {
  /** One-line (or multi-line) suggestion of what to do next. */
  readonly hint?: string;
  /** The original error, preserved for callers that need the raw shape. */
  readonly cause?: unknown;
}

/** Base class for all vex errors. */
export class VexError extends Error {
  /** Machine-readable error category. */
  readonly code: string = "VEX_ERROR";
  /** Actionable next step shown to the user below the message. */
  readonly hint?: string;

  constructor(message: string, options: VexErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.hint = options.hint;
    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

/** The config file is unreadable, invalid, or a target file cannot be written. */
export class ConfigError extends VexError {
  override readonly code: string = "CONFIG";
}

/** No environment could be resolved at all (none configured / no default). */
export class NoEnvironmentError extends VexError {
  override readonly code: string = "NO_ENV";
}

/** A named environment does not exist in the config. */
export class EnvNotFoundError extends VexError {
  override readonly code: string = "ENV_NOT_FOUND";
}

/** The endpoint could not be reached at the transport level (DNS, TCP, TLS). */
export class NetworkError extends VexError {
  override readonly code: string = "NETWORK";
}

/** One compacted GraphQL error from a failed request. */
export interface GraphQLErrorEntry {
  readonly message: string;
  /** The `extensions.code` value, e.g. "FORBIDDEN". */
  readonly code?: string;
  /** Dotted response path, e.g. "products.items". */
  readonly path?: string;
}

/** Options for {@link GraphQLRequestError}. */
export interface GraphQLRequestErrorOptions extends VexErrorOptions {
  readonly status?: number;
  readonly errors?: readonly GraphQLErrorEntry[];
}

/**
 * A GraphQL request that reached the server but returned errors. The message
 * is compact (never echoes the request body — the raw `graphql-request`
 * ClientError stringifies the whole query, inflating failures by hundreds of
 * tokens).
 */
export class GraphQLRequestError extends VexError {
  override readonly code: string = "GRAPHQL";
  readonly status?: number;
  readonly errors: readonly GraphQLErrorEntry[];

  constructor(message: string, options: GraphQLRequestErrorOptions = {}) {
    super(message, options);
    this.status = options.status;
    this.errors = options.errors ?? [];
  }
}

/** Options for {@link PermissionError}. */
export interface PermissionErrorOptions extends GraphQLRequestErrorOptions {
  readonly operationName?: string;
  readonly suggestedPermissions?: readonly string[];
}

/**
 * A request rejected with FORBIDDEN/UNAUTHORIZED — the API key's roles lack a
 * required Vendure permission. `suggestedPermissions` is filled by
 * `enrichPermissionError` (schema-based heuristic) when a cached schema exists.
 */
export class PermissionError extends GraphQLRequestError {
  override readonly code: string = "PERMISSION";
  readonly operationName?: string;
  readonly suggestedPermissions: readonly string[];

  constructor(message: string, options: PermissionErrorOptions = {}) {
    super(message, options);
    this.operationName = options.operationName;
    this.suggestedPermissions = options.suggestedPermissions ?? [];
  }
}

/** GraphQL error codes that indicate a missing permission / invalid auth. */
const PERMISSION_CODES: readonly string[] = ["FORBIDDEN", "UNAUTHORIZED"];

interface RawGraphQLError {
  readonly message?: string;
  readonly path?: ReadonlyArray<string | number>;
  readonly extensions?: { readonly code?: string };
}

interface ClientErrorShape {
  readonly response?: {
    readonly status?: number;
    readonly errors?: ReadonlyArray<RawGraphQLError>;
  };
}

/** Transport-level error codes that indicate a network failure (not e.g. a filesystem error). */
const NETWORK_ERROR_CODES: readonly string[] = [
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "ECONNRESET",
  "EAI_AGAIN",
  "EPIPE",
  "EHOSTUNREACH",
  "ENETUNREACH",
];

/** Returns the error's `.code` (or its `.cause`'s `.code`), if any. */
function errorCode(err: Error): string | undefined {
  return (err as NodeJS.ErrnoException).code ?? (err.cause as NodeJS.ErrnoException | undefined)?.code;
}

function isNetworkFailure(err: unknown): err is Error {
  if (!(err instanceof Error)) return false;
  const code = errorCode(err);
  if (code && (NETWORK_ERROR_CODES.includes(code) || code.startsWith("UND_ERR"))) return true;
  return /fetch failed/i.test(err.message);
}

function networkDetail(err: Error): string {
  return errorCode(err) ?? err.message;
}

/**
 * Normalizes any thrown value into a {@link VexError}. `graphql-request`
 * ClientError shapes become {@link GraphQLRequestError} (or
 * {@link PermissionError} when an error code indicates missing permissions),
 * transport failures become {@link NetworkError}, and everything else is
 * wrapped as a plain {@link VexError}. Existing VexErrors pass through.
 */
export function toVexError(err: unknown): VexError {
  if (err instanceof VexError) return err;

  if (err && typeof err === "object") {
    const e = err as ClientErrorShape;
    const rawErrors = e.response?.errors;
    if (Array.isArray(rawErrors) && rawErrors.length > 0) {
      const entries: GraphQLErrorEntry[] = rawErrors.map((g) => ({
        message: g.message ?? "unknown error",
        ...(g.extensions?.code ? { code: g.extensions.code } : {}),
        ...(g.path && g.path.length ? { path: g.path.join(".") } : {}),
      }));
      const status = e.response?.status;
      const parts = entries.map(
        (en) => `${en.message}${en.code ? ` [${en.code}]` : ""}${en.path ? ` @ ${en.path}` : ""}`
      );
      const message = `${status ? `HTTP ${status} — ` : ""}${parts.join("; ")}`;
      if (entries.some((en) => en.code !== undefined && PERMISSION_CODES.includes(en.code))) {
        return new PermissionError(message, {
          status,
          errors: entries,
          cause: err,
          hint: "The API key's role may lack a required permission. List all permissions with `vex schema permissions`.",
        });
      }
      return new GraphQLRequestError(message, { status, errors: entries, cause: err });
    }
    if (typeof e.response?.status === "number") {
      return new GraphQLRequestError(`HTTP ${e.response.status}`, { status: e.response.status, cause: err });
    }
  }

  if (isNetworkFailure(err)) {
    return new NetworkError(`Endpoint not reachable (${networkDetail(err)})`, {
      cause: err,
      hint: "Check the URL and that the Vendure server is running — try `vex status`.",
    });
  }

  return err instanceof Error
    ? new VexError(err.message, { cause: err })
    : new VexError(String(err));
}

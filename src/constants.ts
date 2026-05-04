/** Default number of items per page for list operations. */
export const DEFAULT_PAGE_SIZE = 20;

/** Default number of items to skip for list operations. */
export const DEFAULT_SKIP = 0;

/** Page size for country list operations (larger since countries are a bounded set). */
export const COUNTRIES_PAGE_SIZE = 250;

/** Default language code used for Vendure translation fields. */
export const DEFAULT_LANGUAGE_CODE = "en";

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

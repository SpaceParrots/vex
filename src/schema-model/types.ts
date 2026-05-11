/**
 * @module schema-model/types
 *
 * Internal shape passed between the wizard, fragment loader, builder, and renderer.
 * Never JSON-serialized for end users.
 */

/** A node in a built selection tree. */
export type Selection =
  | { readonly kind: "scalar" }
  | {
      readonly kind: "object";
      readonly fields: Readonly<Record<string, Selection>>;
      readonly args?: Readonly<Record<string, unknown>>;
    }
  | {
      readonly kind: "union";
      readonly branches: Readonly<Record<string, Selection>>;
      readonly includeTypename: boolean;
    }
  | { readonly kind: "fragmentRef"; readonly name: string };

/** Variables to be sent alongside a GraphQL operation. */
export type Variables = Readonly<Record<string, unknown>>;

/** Helper: build a `scalar` Selection node. */
export const scalar = (): Selection => ({ kind: "scalar" });

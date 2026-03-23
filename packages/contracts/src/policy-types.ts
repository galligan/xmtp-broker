import type {
  PermissionScopeType,
  PermissionError,
} from "@xmtp/signet-schemas";

/** Describes a change between two scope configurations. */
export interface PolicyDelta {
  readonly added: readonly PermissionScopeType[];
  readonly removed: readonly PermissionScopeType[];
  readonly changed: ReadonlyArray<{
    scope: PermissionScopeType;
    from: "allow" | "deny";
    to: "allow" | "deny";
  }>;
}

/** Type alias for scope enforcement error results. */
export type GrantError = PermissionError;

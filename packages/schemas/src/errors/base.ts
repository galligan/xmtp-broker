import type { ErrorCategory } from "./category.js";
import type { ValidationError, AttestationError } from "./validation.js";
import type { NotFoundError } from "./not-found.js";
import type { PermissionError, GrantDeniedError } from "./permission.js";
import type { AuthError, SessionExpiredError } from "./auth.js";
import type { InternalError } from "./internal.js";
import type { TimeoutError } from "./timeout.js";
import type { CancelledError } from "./cancelled.js";
import type { NetworkError } from "./network.js";

/**
 * Base interface for all broker errors. Discriminated by `_tag`.
 * Never constructed directly -- use the static factory on each subclass.
 */
export interface BrokerError extends Error {
  readonly _tag: string;
  readonly code: number;
  readonly category: ErrorCategory;
  readonly context: Record<string, unknown> | null;
}

export type AnyBrokerError =
  | ValidationError
  | NotFoundError
  | PermissionError
  | GrantDeniedError
  | AuthError
  | SessionExpiredError
  | InternalError
  | TimeoutError
  | CancelledError
  | AttestationError
  | NetworkError;

/** Type-safe error matching by _tag discriminant. */
export function matchError<T>(
  error: AnyBrokerError,
  handlers: {
    [K in AnyBrokerError["_tag"]]: (
      e: Extract<AnyBrokerError, { _tag: K }>,
    ) => T;
  },
): T {
  // Safety: error._tag is already AnyBrokerError["_tag"] so the lookup is
  // type-safe, but TS can't narrow an indexed-access on a union discriminant
  // back to the matching handler signature. The mapped-type constraint on
  // `handlers` guarantees every _tag has the correctly-typed handler, so the
  // single cast on invocation is sound.
  const tag = error._tag;
  const handler: (e: AnyBrokerError) => T = handlers[tag] as (
    e: AnyBrokerError,
  ) => T;
  return handler(error);
}

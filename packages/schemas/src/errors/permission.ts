import type { SignetError } from "./base.js";

/** Raised when an operation is denied by policy or permissions. */
export class PermissionError extends Error implements SignetError {
  readonly _tag = "PermissionError" as const;
  readonly code = 1200;
  readonly category = "permission" as const;

  constructor(
    message: string,
    readonly context: Record<string, unknown> | null,
  ) {
    super(message);
    this.name = "PermissionError";
  }

  static create(
    message: string,
    context?: Record<string, unknown>,
  ): PermissionError {
    return new PermissionError(message, context ?? null);
  }
}

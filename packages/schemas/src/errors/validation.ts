import type { SignetError } from "./base.js";

export class ValidationError extends Error implements SignetError {
  readonly _tag = "ValidationError" as const;
  readonly code = 1000;
  readonly category = "validation" as const;

  constructor(
    message: string,
    readonly context: { field: string; reason: string } & Record<
      string,
      unknown
    >,
  ) {
    super(message);
    this.name = "ValidationError";
  }

  static create(
    field: string,
    reason: string,
    extra?: Record<string, unknown>,
  ): ValidationError {
    return new ValidationError(`Validation failed on '${field}': ${reason}`, {
      field,
      reason,
      ...extra,
    });
  }
}

export class SealError extends Error implements SignetError {
  readonly _tag = "SealError" as const;
  readonly code = 1010;
  readonly category = "validation" as const;

  constructor(
    message: string,
    readonly context: { attestationId: string } & Record<string, unknown>,
  ) {
    super(message);
    this.name = "SealError";
  }

  static create(attestationId: string, reason: string): SealError {
    return new SealError(`Seal '${attestationId}': ${reason}`, {
      attestationId,
      reason,
    });
  }
}

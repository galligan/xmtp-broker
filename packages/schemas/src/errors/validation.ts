import type { BrokerError } from "./base.js";

export class ValidationError extends Error implements BrokerError {
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

export class AttestationError extends Error implements BrokerError {
  readonly _tag = "AttestationError" as const;
  readonly code = 1010;
  readonly category = "validation" as const;

  constructor(
    message: string,
    readonly context: { attestationId: string } & Record<string, unknown>,
  ) {
    super(message);
    this.name = "AttestationError";
  }

  static create(attestationId: string, reason: string): AttestationError {
    return new AttestationError(`Attestation '${attestationId}': ${reason}`, {
      attestationId,
      reason,
    });
  }
}

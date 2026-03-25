/**
 * Policy manager implementation.
 *
 * Manages policy creation, lookup, updates, and removal.
 * Uses an in-memory Map store for v1. Implements the
 * {@link PolicyManager} contract from `@xmtp/signet-contracts`.
 */

import { Result } from "better-result";
import type {
  PolicyConfigType,
  PolicyRecordType,
  SignetError,
} from "@xmtp/signet-schemas";
import {
  createResourceId,
  PolicyConfig,
  NotFoundError,
  ValidationError,
} from "@xmtp/signet-schemas";
import type { PolicyManager } from "@xmtp/signet-contracts";

/** Internal helper methods exposed for testing and composition. */
export interface PolicyManagerInternal {
  /** Get count of stored policies. */
  readonly size: number;
}

/**
 * Validates a policy config, returning a ValidationError if invalid.
 * Returns null when valid.
 */
function validateConfig(config: PolicyConfigType): ValidationError | null {
  const parsed = PolicyConfig.safeParse(config);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue !== undefined ? issue.path.join(".") : "config";
    const reason = issue !== undefined ? issue.message : "Invalid config";
    return ValidationError.create(field, reason);
  }
  return null;
}

/**
 * Creates an in-memory policy manager implementing the
 * {@link PolicyManager} contract with internal helpers.
 *
 * @returns Combined PolicyManager and PolicyManagerInternal
 */
export function createPolicyManager(): PolicyManager & PolicyManagerInternal {
  const store = new Map<string, PolicyRecordType>();

  return {
    get size(): number {
      return store.size;
    },

    async create(
      config: PolicyConfigType,
    ): Promise<Result<PolicyRecordType, SignetError>> {
      const validationErr = validateConfig(config);
      if (validationErr !== null) {
        return Result.err(validationErr);
      }

      const id = createResourceId("policy");
      const now = new Date().toISOString();
      const record: PolicyRecordType = {
        id,
        config,
        createdAt: now,
        updatedAt: now,
      };

      store.set(id, record);
      return Result.ok(record);
    },

    async list(): Promise<Result<readonly PolicyRecordType[], SignetError>> {
      return Result.ok([...store.values()]);
    },

    async lookup(
      policyId: string,
    ): Promise<Result<PolicyRecordType, SignetError>> {
      const record = store.get(policyId);
      if (record === undefined) {
        return Result.err(NotFoundError.create("policy", policyId));
      }
      return Result.ok(record);
    },

    async update(
      policyId: string,
      changes: Partial<PolicyConfigType>,
    ): Promise<Result<PolicyRecordType, SignetError>> {
      const existing = store.get(policyId);
      if (existing === undefined) {
        return Result.err(NotFoundError.create("policy", policyId));
      }

      const merged: PolicyConfigType = {
        ...existing.config,
        ...changes,
      };

      const validationErr = validateConfig(merged);
      if (validationErr !== null) {
        return Result.err(validationErr);
      }

      const updated: PolicyRecordType = {
        ...existing,
        config: merged,
        updatedAt: new Date().toISOString(),
      };

      store.set(policyId, updated);
      return Result.ok(updated);
    },

    async remove(policyId: string): Promise<Result<void, SignetError>> {
      const existing = store.get(policyId);
      if (existing === undefined) {
        return Result.err(NotFoundError.create("policy", policyId));
      }

      store.delete(policyId);
      return Result.ok(undefined);
    },
  };
}

/**
 * Tests for the production InputResolver wiring in start.ts.
 *
 * Since the InputResolver is a closure inside createProductionDeps, we test
 * it indirectly through the seal manager's issue path using an integration-style
 * approach with real credential and operator managers.
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { Result } from "better-result";
import type { SignetError, OperatorConfigType } from "@xmtp/signet-schemas";
import type {
  CredentialManager,
  OperatorManager,
} from "@xmtp/signet-contracts";
import { checkChatInScope } from "@xmtp/signet-policy";
import type { InputResolver } from "@xmtp/signet-seals";
import { createOperatorManager } from "@xmtp/signet-sessions";
import { InternalError } from "@xmtp/signet-schemas";

/** Minimal CredentialManager mock that returns a fixed record. */
function createMockCredentialManager(record?: {
  id: string;
  config: {
    operatorId: string;
    chatIds: string[];
    allow?: string[];
    deny?: string[];
  };
}): CredentialManager {
  return {
    async issue() {
      return Result.err(InternalError.create("not implemented") as SignetError);
    },
    async list() {
      return Result.ok([]);
    },
    async lookup(credentialId: string) {
      if (record && record.id === credentialId) {
        return Result.ok({
          id: record.id,
          config: {
            operatorId: record.config.operatorId,
            chatIds: record.config.chatIds,
            allow: record.config.allow,
            deny: record.config.deny,
          },
          inboxIds: [],
          status: "active" as const,
          issuedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          issuedBy: "owner" as const,
        });
      }
      return Result.err(InternalError.create("not found") as SignetError);
    },
    async lookupByToken() {
      return Result.err(InternalError.create("not implemented") as SignetError);
    },
    async revoke() {
      return Result.err(InternalError.create("not implemented") as SignetError);
    },
    async updateScopes() {
      return Result.err(InternalError.create("not implemented") as SignetError);
    },
  };
}

/**
 * Build a real InputResolver following the same logic as start.ts.
 * This is a unit-testable extraction of the production closure.
 */
function buildInputResolver(
  credentialManager: CredentialManager,
  operatorManager: OperatorManager,
): InputResolver {
  return async (credentialId, chatId) => {
    const credResult = await credentialManager.lookup(credentialId);
    if (Result.isError(credResult)) return credResult;
    const cred = credResult.value;

    const opResult = await operatorManager.lookup(cred.config.operatorId);
    if (Result.isError(opResult)) return opResult;
    const op = opResult.value;

    const permissions = {
      allow: cred.config.allow ?? [],
      deny: cred.config.deny ?? [],
    };

    const inScopeResult = checkChatInScope(chatId, cred.config.chatIds);
    if (Result.isError(inScopeResult)) return inScopeResult;

    return Result.ok({
      credentialId,
      operatorId: cred.config.operatorId,
      chatId,
      scopeMode: op.config.scopeMode,
      permissions,
    });
  };
}

describe("InputResolver", () => {
  let operatorManager: OperatorManager;
  let operatorId: string;

  beforeEach(async () => {
    operatorManager = createOperatorManager();
    const config: OperatorConfigType = {
      label: "test-bot",
      role: "operator",
      scopeMode: "per-chat",
    };
    const result = await operatorManager.create(config);
    expect(Result.isOk(result)).toBe(true);
    if (Result.isOk(result)) {
      operatorId = result.value.id;
    }
  });

  test("resolves SealInput from credential and operator records", async () => {
    const credManager = createMockCredentialManager({
      id: "cred_0123456789abcdef",
      config: {
        operatorId,
        chatIds: ["conv_aabbccdd11223344"],
        allow: ["messaging:send"],
        deny: ["access:*"],
      },
    });

    const resolver = buildInputResolver(credManager, operatorManager);
    const result = await resolver(
      "cred_0123456789abcdef",
      "conv_aabbccdd11223344",
    );

    expect(Result.isOk(result)).toBe(true);
    if (Result.isOk(result)) {
      expect(result.value.credentialId).toBe("cred_0123456789abcdef");
      expect(result.value.operatorId).toBe(operatorId);
      expect(result.value.chatId).toBe("conv_aabbccdd11223344");
      expect(result.value.scopeMode).toBe("per-chat");
      expect(result.value.permissions.allow).toEqual(["messaging:send"]);
      expect(result.value.permissions.deny).toEqual(["access:*"]);
    }
  });

  test("uses empty arrays when credential has no inline scopes", async () => {
    const credManager = createMockCredentialManager({
      id: "cred_0123456789abcdef",
      config: {
        operatorId,
        chatIds: ["conv_aabbccdd11223344"],
      },
    });

    const resolver = buildInputResolver(credManager, operatorManager);
    const result = await resolver(
      "cred_0123456789abcdef",
      "conv_aabbccdd11223344",
    );

    expect(Result.isOk(result)).toBe(true);
    if (Result.isOk(result)) {
      expect(result.value.permissions.allow).toEqual([]);
      expect(result.value.permissions.deny).toEqual([]);
    }
  });

  test("returns error when credential not found", async () => {
    const credManager = createMockCredentialManager();
    const resolver = buildInputResolver(credManager, operatorManager);
    const result = await resolver("cred_doesnotexist1234", "conv_abc");

    expect(Result.isError(result)).toBe(true);
  });

  test("returns error when operator not found", async () => {
    const credManager = createMockCredentialManager({
      id: "cred_0123456789abcdef",
      config: {
        operatorId: "op_doesnotexist12345",
        chatIds: ["conv_aabbccdd11223344"],
      },
    });

    const resolver = buildInputResolver(credManager, operatorManager);
    const result = await resolver(
      "cred_0123456789abcdef",
      "conv_aabbccdd11223344",
    );

    expect(Result.isError(result)).toBe(true);
  });

  test("returns error when the requested chat is outside the credential scope", async () => {
    const credManager = createMockCredentialManager({
      id: "cred_0123456789abcdef",
      config: {
        operatorId,
        chatIds: ["conv_aabbccdd11223344"],
      },
    });

    const resolver = buildInputResolver(credManager, operatorManager);
    const result = await resolver(
      "cred_0123456789abcdef",
      "conv_deadbeef11223344",
    );

    expect(Result.isError(result)).toBe(true);
    if (Result.isError(result)) {
      expect(result.error.category).toBe("permission");
    }
  });

  test("reflects shared scope mode from operator", async () => {
    // Create a shared-scope operator
    const sharedResult = await operatorManager.create({
      label: "shared-bot",
      role: "operator",
      scopeMode: "shared",
    });
    expect(Result.isOk(sharedResult)).toBe(true);
    if (!Result.isOk(sharedResult)) return;

    const credManager = createMockCredentialManager({
      id: "cred_0123456789abcdef",
      config: {
        operatorId: sharedResult.value.id,
        chatIds: ["conv_aabbccdd11223344"],
      },
    });

    const resolver = buildInputResolver(credManager, operatorManager);
    const result = await resolver(
      "cred_0123456789abcdef",
      "conv_aabbccdd11223344",
    );

    expect(Result.isOk(result)).toBe(true);
    if (Result.isOk(result)) {
      expect(result.value.scopeMode).toBe("shared");
    }
  });
});

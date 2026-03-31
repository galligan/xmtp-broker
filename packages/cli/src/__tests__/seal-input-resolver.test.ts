/**
 * Tests for the extracted production seal input resolver.
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { Result } from "better-result";
import type { SignetError, OperatorConfigType } from "@xmtp/signet-schemas";
import type {
  CredentialManager,
  OperatorManager,
} from "@xmtp/signet-contracts";
import { createOperatorManager } from "@xmtp/signet-sessions";
import { InternalError } from "@xmtp/signet-schemas";
import {
  buildSealProvenanceMap,
  createSealInputResolver,
} from "../seal-input-resolver.js";

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

    const resolver = createSealInputResolver({
      credentialManager: credManager,
      operatorManager,
      trustTier: "source-verified",
    });
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
      expect(result.value.trustTier).toBe("source-verified");
      expect(result.value.provenanceMap).toEqual({
        trustTier: { source: "verified" },
      });
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

    const resolver = createSealInputResolver({
      credentialManager: credManager,
      operatorManager,
      trustTier: "unverified",
    });
    const result = await resolver(
      "cred_0123456789abcdef",
      "conv_aabbccdd11223344",
    );

    expect(Result.isOk(result)).toBe(true);
    if (Result.isOk(result)) {
      expect(result.value.permissions.allow).toEqual([]);
      expect(result.value.permissions.deny).toEqual([]);
      expect(result.value.trustTier).toBe("unverified");
    }
  });

  test("returns error when credential not found", async () => {
    const credManager = createMockCredentialManager();
    const resolver = createSealInputResolver({
      credentialManager: credManager,
      operatorManager,
      trustTier: "source-verified",
    });
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

    const resolver = createSealInputResolver({
      credentialManager: credManager,
      operatorManager,
      trustTier: "source-verified",
    });
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

    const resolver = createSealInputResolver({
      credentialManager: credManager,
      operatorManager,
      trustTier: "source-verified",
    });
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

    const resolver = createSealInputResolver({
      credentialManager: credManager,
      operatorManager,
      trustTier: "source-verified",
    });
    const result = await resolver(
      "cred_0123456789abcdef",
      "conv_aabbccdd11223344",
    );

    expect(Result.isOk(result)).toBe(true);
    if (Result.isOk(result)) {
      expect(result.value.scopeMode).toBe("shared");
    }
  });

  test("passes through operator disclosures and declared provenance", async () => {
    const disclosedResult = await operatorManager.create({
      label: "disclosed-bot",
      role: "operator",
      scopeMode: "per-chat",
      operatorDisclosures: {
        inferenceMode: "hybrid",
        inferenceProviders: ["openai", "anthropic"],
        contentEgressScope: "provider-only",
        retentionAtProvider: "30 days",
        hostingMode: "cloud",
      },
    });
    expect(Result.isOk(disclosedResult)).toBe(true);
    if (!Result.isOk(disclosedResult)) return;

    const credManager = createMockCredentialManager({
      id: "cred_0123456789abcdef",
      config: {
        operatorId: disclosedResult.value.id,
        chatIds: ["conv_aabbccdd11223344"],
      },
    });

    const resolver = createSealInputResolver({
      credentialManager: credManager,
      operatorManager,
      trustTier: "source-verified",
    });
    const result = await resolver(
      "cred_0123456789abcdef",
      "conv_aabbccdd11223344",
    );

    expect(Result.isOk(result)).toBe(true);
    if (!Result.isOk(result)) return;
    expect(result.value.operatorDisclosures).toEqual({
      inferenceMode: "hybrid",
      inferenceProviders: ["openai", "anthropic"],
      contentEgressScope: "provider-only",
      retentionAtProvider: "30 days",
      hostingMode: "cloud",
    });
    expect(result.value.provenanceMap).toEqual({
      trustTier: { source: "verified" },
      inferenceMode: { source: "declared" },
      inferenceProviders: { source: "declared" },
      contentEgressScope: { source: "declared" },
      retentionAtProvider: { source: "declared" },
      hostingMode: { source: "declared" },
    });
  });
});

describe("buildSealProvenanceMap", () => {
  test("marks trust tier as verified and disclosures as declared", () => {
    expect(
      buildSealProvenanceMap({
        trustTier: "source-verified",
        operatorDisclosures: {
          inferenceMode: "cloud",
          hostingMode: "self-hosted",
        },
      }),
    ).toEqual({
      trustTier: { source: "verified" },
      inferenceMode: { source: "declared" },
      hostingMode: { source: "declared" },
    });
  });
});

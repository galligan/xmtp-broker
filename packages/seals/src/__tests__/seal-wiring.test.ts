import { describe, test, expect } from "bun:test";
import { Result } from "better-result";
import type { Seal, RevocationSeal } from "@xmtp/signet-schemas";
import { createSealStamper, type SigningKeyHandle } from "../stamper.js";
import { createSealPublisher, type PublisherDeps } from "../publisher.js";
import { SEAL_CONTENT_TYPE_ID } from "../content-type.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

async function createTestKeyHandle(): Promise<SigningKeyHandle> {
  const keyPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ]);

  const raw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const hex = Array.from(new Uint8Array(raw))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return {
    fingerprint: () => hex.slice(0, 16),
    async sign(data: Uint8Array): Promise<Uint8Array> {
      const sig = await crypto.subtle.sign(
        { name: "Ed25519" },
        keyPair.privateKey,
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      );
      return new Uint8Array(sig);
    },
  };
}

function makeSeal(overrides?: Partial<Seal>): Seal {
  return {
    sealId: "seal-wire-1",
    previousSealId: null,
    agentInboxId: "agent-inbox-1",
    ownerInboxId: "owner-inbox-1",
    groupId: "group-1",
    threadScope: null,
    viewMode: "full",
    contentTypes: ["xmtp.org/text:1.0"],
    grantedOps: ["send", "reply"],
    toolScopes: [],
    inferenceMode: "local",
    inferenceProviders: [],
    contentEgressScope: "none",
    retentionAtProvider: "none",
    hostingMode: "local",
    trustTier: "unverified",
    buildProvenanceRef: null,
    verifierStatementRef: null,
    sessionKeyFingerprint: null,
    policyHash: "sha256:abc123",
    heartbeatInterval: 30,
    issuedAt: "2025-01-01T00:00:00.000Z",
    expiresAt: "2025-01-02T00:00:00.000Z",
    revocationRules: {
      maxTtlSeconds: 86400,
      requireHeartbeat: true,
      ownerCanRevoke: true,
      adminCanRemove: true,
    },
    issuer: "signet-1",
    ...overrides,
  };
}

function makeRevocation(overrides?: Partial<RevocationSeal>): RevocationSeal {
  return {
    sealId: "revoke-wire-1",
    previousSealId: "seal-wire-1",
    agentInboxId: "agent-inbox-1",
    groupId: "group-1",
    reason: "owner-initiated",
    revokedAt: "2025-01-01T12:00:00.000Z",
    issuer: "signet-1",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Integration tests: stamper + publisher wired together
// ---------------------------------------------------------------------------

describe("seal wiring: stamper + publisher", () => {
  test("stamper signs seal and publisher sends with correct content type", async () => {
    const keyHandle = await createTestKeyHandle();
    const stamper = createSealStamper({ signingKey: keyHandle });

    const sentMessages: Array<{
      groupId: string;
      contentType: string;
      content: unknown;
    }> = [];

    const publisherDeps: PublisherDeps = {
      async sendMessage(groupId, contentType, content) {
        sentMessages.push({ groupId, contentType, content });
        return Result.ok({ messageId: "msg-seal-1" });
      },
    };
    const publisher = createSealPublisher(publisherDeps);

    // Stamp the seal
    const seal = makeSeal();
    const stampResult = await stamper.sign(seal);
    expect(Result.isOk(stampResult)).toBe(true);
    if (!Result.isOk(stampResult)) return;

    // Publish the envelope
    const publishResult = await publisher.publish("group-1", stampResult.value);
    expect(Result.isOk(publishResult)).toBe(true);

    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]!.contentType).toBe(SEAL_CONTENT_TYPE_ID);
    expect(sentMessages[0]!.groupId).toBe("group-1");

    // Verify the published content round-trips
    const parsed = JSON.parse(sentMessages[0]!.content as string);
    expect(parsed.seal.sealId).toBe("seal-wire-1");
    expect(parsed.signatureAlgorithm).toBe("Ed25519");
    expect(parsed.signerKeyRef).toBe(keyHandle.fingerprint());
  });

  test("end-to-end seal flow uses xmtp.org/agentSeal:1.0 content type", async () => {
    const keyHandle = await createTestKeyHandle();
    const stamper = createSealStamper({ signingKey: keyHandle });

    let capturedContentType = "";
    const publisher = createSealPublisher({
      async sendMessage(_groupId, contentType, _content) {
        capturedContentType = contentType;
        return Result.ok({ messageId: "msg-e2e-1" });
      },
    });

    const stampResult = await stamper.sign(makeSeal());
    expect(Result.isOk(stampResult)).toBe(true);
    if (!Result.isOk(stampResult)) return;

    await publisher.publish("group-1", stampResult.value);

    expect(capturedContentType).toBe("xmtp.org/agentSeal:1.0");
  });

  test("revocation flow uses xmtp.org/agentRevocation:1.0 content type", async () => {
    const keyHandle = await createTestKeyHandle();
    const stamper = createSealStamper({ signingKey: keyHandle });

    let capturedContentType = "";
    const publisher = createSealPublisher({
      async sendMessage(_groupId, contentType, _content) {
        capturedContentType = contentType;
        return Result.ok({ messageId: "msg-rev-1" });
      },
    });

    const revResult = await stamper.signRevocation(makeRevocation());
    expect(Result.isOk(revResult)).toBe(true);
    if (!Result.isOk(revResult)) return;

    await publisher.publishRevocation("group-1", revResult.value);

    expect(capturedContentType).toBe("xmtp.org/agentRevocation:1.0");
  });
});

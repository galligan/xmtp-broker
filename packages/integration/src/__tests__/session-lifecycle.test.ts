/**
 * Credential lifecycle integration tests.
 *
 * Validates credential issuance, lookup, heartbeat, expiry,
 * revocation, and materiality checks through the exported
 * credential manager.
 */

import { describe, test, expect } from "bun:test";
import { createCredentialManager } from "@xmtp/signet-sessions";
import type {
  CredentialConfigType,
  PermissionScopeType,
  ScopeSetType,
} from "@xmtp/signet-schemas";

function makeCredentialConfig(
  overrides: Partial<CredentialConfigType> = {},
): CredentialConfigType {
  return {
    operatorId: "op_test1234",
    chatIds: ["conv_group1"],
    allow: ["read-messages", "list-conversations"] as PermissionScopeType[],
    deny: [],
    ttlSeconds: 60,
    ...overrides,
  };
}

function makeScopes(overrides: Partial<ScopeSetType> = {}): ScopeSetType {
  return {
    allow: ["read-messages", "list-conversations"] as PermissionScopeType[],
    deny: [],
    ...overrides,
  };
}

describe("credential-lifecycle", () => {
  test("issueCredential returns token and correct metadata", async () => {
    const manager = createCredentialManager({ defaultTtlSeconds: 60 });

    const result = await manager.issueCredential(makeCredentialConfig());
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;

    const credential = result.value;
    expect(credential.credentialId).toMatch(/^cred_[0-9a-f]{8}$/);
    expect(credential.token).toBeTruthy();
    expect(credential.operatorId).toBe("op_test1234");
    expect(credential.chatIds).toEqual(["conv_group1"]);
    expect(credential.status).toBe("active");

    const expiresAt = new Date(credential.expiresAt).getTime();
    const issuedAt = new Date(credential.issuedAt).getTime();
    expect(expiresAt - issuedAt).toBeGreaterThanOrEqual(59_000);
    expect(expiresAt - issuedAt).toBeLessThanOrEqual(61_000);
  });

  test("lookup by ID and token returns matching credential", async () => {
    const manager = createCredentialManager();

    const issued = await manager.issueCredential(makeCredentialConfig());
    expect(issued.isOk()).toBe(true);
    if (!issued.isOk()) return;

    const byId = manager.getCredentialById(issued.value.credentialId);
    expect(byId.isOk()).toBe(true);
    if (!byId.isOk()) return;

    const byToken = manager.getCredentialByToken(issued.value.token);
    expect(byToken.isOk()).toBe(true);
    if (!byToken.isOk()) return;

    expect(byId.value.credentialId).toBe(issued.value.credentialId);
    expect(byToken.value.credentialId).toBe(issued.value.credentialId);
    expect(byToken.value.operatorId).toBe("op_test1234");
  });

  test("heartbeat updates lastHeartbeat on active credential", async () => {
    const manager = createCredentialManager();

    const issued = await manager.issueCredential(makeCredentialConfig());
    expect(issued.isOk()).toBe(true);
    if (!issued.isOk()) return;

    const firstHeartbeat = issued.value.lastHeartbeat;
    await Bun.sleep(20);

    const heartbeat = manager.recordHeartbeat(issued.value.credentialId);
    expect(heartbeat.isOk()).toBe(true);

    const afterHeartbeat = manager.getCredentialById(issued.value.credentialId);
    expect(afterHeartbeat.isOk()).toBe(true);
    if (!afterHeartbeat.isOk()) return;
    expect(afterHeartbeat.value.lastHeartbeat).not.toBe(firstHeartbeat);
  });

  test("expired credential returns CredentialExpiredError on token lookup", async () => {
    const manager = createCredentialManager({ defaultTtlSeconds: 1 });

    const issued = await manager.issueCredential(
      makeCredentialConfig({ ttlSeconds: 1 }),
    );
    expect(issued.isOk()).toBe(true);
    if (!issued.isOk()) return;

    await Bun.sleep(1_100);

    const lookup = manager.getCredentialByToken(issued.value.token);
    expect(lookup.isErr()).toBe(true);
    if (!lookup.isErr()) return;
    expect(lookup.error._tag).toBe("CredentialExpiredError");

    const byId = manager.getCredentialById(issued.value.credentialId);
    expect(byId.isOk()).toBe(true);
    if (!byId.isOk()) return;
    expect(byId.value.status).toBe("expired");
  });

  test("revokeCredential causes immediate invalidation", async () => {
    const manager = createCredentialManager();

    const issued = await manager.issueCredential(makeCredentialConfig());
    expect(issued.isOk()).toBe(true);
    if (!issued.isOk()) return;

    const revoke = manager.revokeCredential(
      issued.value.credentialId,
      "owner-initiated",
    );
    expect(revoke.isOk()).toBe(true);
    if (!revoke.isOk()) return;
    expect(revoke.value.status).toBe("revoked");

    const byToken = manager.getCredentialByToken(issued.value.token);
    expect(byToken.isErr()).toBe(true);
    if (!byToken.isErr()) return;
    expect(byToken.error._tag).toBe("CredentialExpiredError");

    const heartbeat = manager.recordHeartbeat(issued.value.credentialId);
    expect(heartbeat.isErr()).toBe(true);
    if (!heartbeat.isErr()) return;
    expect(heartbeat.error._tag).toBe("CredentialExpiredError");
  });

  test("materiality check detects scope escalation", async () => {
    const manager = createCredentialManager();

    const issued = await manager.issueCredential(
      makeCredentialConfig({
        allow: ["read-messages"] as PermissionScopeType[],
      }),
    );
    expect(issued.isOk()).toBe(true);
    if (!issued.isOk()) return;

    const escalated = manager.checkMateriality(
      issued.value.credentialId,
      makeScopes({
        allow: ["read-messages", "send"] as PermissionScopeType[],
      }),
    );
    expect(escalated.isOk()).toBe(true);
    if (!escalated.isOk()) return;
    expect(escalated.value.isMaterial).toBe(true);

    const unchanged = manager.checkMateriality(
      issued.value.credentialId,
      makeScopes({ allow: ["read-messages"] as PermissionScopeType[] }),
    );
    expect(unchanged.isOk()).toBe(true);
    if (!unchanged.isOk()) return;
    expect(unchanged.value.isMaterial).toBe(false);
  });
});

import { afterEach, describe, expect, test } from "bun:test";
import { Result } from "better-result";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createKeyManager } from "../key-manager-compat.js";
import { createSealStamper } from "../seal-stamper.js";
import { createSignerProvider } from "../signer-provider.js";

const testDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    testDirs.splice(0).map((dir) =>
      rm(dir, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

async function setupCompatKeyManager() {
  const dataDir = await mkdtemp(join(tmpdir(), "xmtp-signet-keymgr-compat-"));
  testDirs.push(dataDir);

  const managerResult = await createKeyManager({
    dataDir,
    rootKeyPolicy: "open",
    operationalKeyPolicy: "open",
  });
  expect(Result.isOk(managerResult)).toBe(true);
  if (Result.isError(managerResult)) {
    throw new Error("failed to create compat key manager");
  }

  const initResult = await managerResult.value.initialize();
  expect(Result.isOk(initResult)).toBe(true);

  return managerResult.value;
}

describe("createKeyManager admin key persistence", () => {
  test("reloads persisted admin key so later processes can sign JWTs", async () => {
    const firstManager = await setupCompatKeyManager();

    const created = await firstManager.admin.create();
    expect(Result.isOk(created)).toBe(true);
    if (Result.isError(created)) return;

    const firstToken = await firstManager.admin.signJwt({ ttlSeconds: 120 });
    expect(Result.isOk(firstToken)).toBe(true);
    firstManager.close();

    const secondManager = await createKeyManager({
      dataDir: testDirs[0] ?? "",
      rootKeyPolicy: "open",
      operationalKeyPolicy: "open",
    });
    expect(Result.isOk(secondManager)).toBe(true);
    if (Result.isError(secondManager)) return;

    const initSecond = await secondManager.value.initialize();
    expect(Result.isOk(initSecond)).toBe(true);
    expect(secondManager.value.admin.exists()).toBe(true);

    const reloaded = await secondManager.value.admin.get();
    expect(Result.isOk(reloaded)).toBe(true);
    if (Result.isError(reloaded)) return;
    expect(reloaded.value.fingerprint).toBe(created.value.fingerprint);

    const secondToken = await secondManager.value.admin.signJwt({
      ttlSeconds: 120,
    });
    expect(Result.isOk(secondToken)).toBe(true);
    secondManager.value.close();
  });

  test("rejects tampered admin JWT signatures", async () => {
    const manager = await setupCompatKeyManager();
    const created = await manager.admin.create();
    expect(Result.isOk(created)).toBe(true);
    if (Result.isError(created)) return;

    const signed = await manager.admin.signJwt({ ttlSeconds: 120 });
    expect(Result.isOk(signed)).toBe(true);
    if (Result.isError(signed)) return;

    const parts = signed.value.split(".");
    expect(parts).toHaveLength(3);
    const signatureBytes = Buffer.from(parts[2] ?? "", "base64url");
    signatureBytes[0] = (signatureBytes[0] ?? 0) ^ 1;
    const tamperedSignature = signatureBytes.toString("base64url");
    const tampered = [parts[0], parts[1], tamperedSignature].join(".");

    const verified = await manager.admin.verifyJwt(tampered);
    expect(Result.isError(verified)).toBe(true);
  });
});

describe("compat signer and stamper helpers", () => {
  test("createSignerProvider accepts a compat KeyManager", async () => {
    const manager = await setupCompatKeyManager();
    const opKey = await manager.createOperationalKey("identity-a", null);
    expect(Result.isOk(opKey)).toBe(true);
    if (Result.isError(opKey)) return;

    const signer = createSignerProvider(manager, "identity-a");
    const signature = await signer.sign(new Uint8Array([1, 2, 3]));
    expect(Result.isOk(signature)).toBe(true);

    const fingerprint = await signer.getFingerprint();
    expect(Result.isOk(fingerprint)).toBe(true);
    if (Result.isError(fingerprint)) return;
    expect(fingerprint.value).toBe(opKey.value.fingerprint);

    const dbKey = await signer.getDbEncryptionKey();
    expect(Result.isOk(dbKey)).toBe(true);

    const identityKey = await signer.getXmtpIdentityKey();
    expect(Result.isOk(identityKey)).toBe(true);
    if (Result.isError(identityKey)) return;
    expect(identityKey.value.startsWith("0x")).toBe(true);
  });

  test("createSealStamper accepts a compat KeyManager", async () => {
    const manager = await setupCompatKeyManager();
    const opKey = await manager.createOperationalKey(
      "identity-b",
      "conv_aabbccddeeff0011",
    );
    expect(Result.isOk(opKey)).toBe(true);

    const stamper = createSealStamper(manager, "identity-b");
    const envelope = await stamper.sign({
      sealId: "seal_aabbccddeeff0011",
      credentialId: "cred_aabbccddeeff0011",
      operatorId: "op_aabbccddeeff0011",
      chatId: "conv_aabbccddeeff0011",
      scopeMode: "per-chat",
      permissions: { allow: ["send"], deny: [] },
      issuedAt: new Date().toISOString(),
    });
    expect(Result.isOk(envelope)).toBe(true);
    if (Result.isError(envelope)) return;
    expect(envelope.value.algorithm).toBe("Ed25519");
    expect(envelope.value.signature.length).toBeGreaterThan(0);

    const revocation = await stamper.signRevocation({
      sealId: "seal_bbccddeefeedbabe",
      previousSealId: "seal_aabbccddeeff0011",
      operatorId: "op_aabbccddeeff0011",
      credentialId: "cred_aabbccddeeff0011",
      chatId: "conv_aabbccddeeff0011",
      reason: "owner-initiated",
      revokedAt: new Date().toISOString(),
      issuer: "owner",
    });
    expect(Result.isOk(revocation)).toBe(true);
  });
});

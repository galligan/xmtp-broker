import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createKeyManager, type KeyManager } from "../key-manager.js";

let tmpDir: string;
let manager: KeyManager | null = null;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "key-rotation-test-"));
});

afterEach(() => {
  manager?.close();
  manager = null;
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("auto-rotation", () => {
  test("startAutoRotation is a no-op when interval is 0", async () => {
    const result = await createKeyManager({
      dataDir: tmpDir,
      rotationIntervalSeconds: 0,
    });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    manager = result.value;

    // Should not throw
    manager.startAutoRotation();
    manager.stopAutoRotation();
  });

  test("rotateOperationalKey creates new key material", async () => {
    const result = await createKeyManager({
      dataDir: tmpDir,
      rotationIntervalSeconds: 86400,
    });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    manager = result.value;

    await manager.initialize();
    const createResult = await manager.createOperationalKey("id-1", null);
    expect(createResult.isOk()).toBe(true);
    if (!createResult.isOk()) return;
    const original = createResult.value;

    const rotateResult = await manager.rotateOperationalKey("id-1");
    expect(rotateResult.isOk()).toBe(true);
    if (!rotateResult.isOk()) return;
    const rotated = rotateResult.value;

    expect(rotated.keyId).not.toBe(original.keyId);
    expect(rotated.fingerprint).not.toBe(original.fingerprint);
    expect(rotated.identityId).toBe(original.identityId);
    expect(rotated.rotatedAt).toBeTruthy();
  });

  test("close stops auto-rotation timer", async () => {
    const result = await createKeyManager({
      dataDir: tmpDir,
      rotationIntervalSeconds: 1,
    });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    manager = result.value;

    manager.startAutoRotation();
    // Close should clean up the timer without errors
    manager.close();
    manager = null;
  });
});

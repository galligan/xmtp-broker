import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Result } from "better-result";
import {
  writeFileSync,
  chmodSync,
  mkdtempSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createSePassphraseProvider,
  createSoftwarePassphraseProvider,
  resolvePassphraseProvider,
} from "../passphrase-provider.js";

describe("SoftwarePassphraseProvider", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "signet-pp-sw-"));
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("generates and persists a passphrase on first call", async () => {
    const provider = createSoftwarePassphraseProvider(tmpDir);
    const result = await provider.getPassphrase();

    expect(Result.isOk(result)).toBe(true);
    if (Result.isError(result)) throw new Error("expected ok");

    // 32 bytes hex = 64 chars
    expect(result.value).toMatch(/^[0-9a-f]{64}$/);

    // File exists on disk
    expect(existsSync(join(tmpDir, "vault-passphrase"))).toBe(true);
  });

  test("returns same passphrase on subsequent calls", async () => {
    const provider = createSoftwarePassphraseProvider(tmpDir);
    const r1 = await provider.getPassphrase();
    const r2 = await provider.getPassphrase();

    expect(Result.isOk(r1)).toBe(true);
    expect(Result.isOk(r2)).toBe(true);
    if (Result.isError(r1) || Result.isError(r2)) throw new Error("fail");

    expect(r1.value).toBe(r2.value);
  });

  test("reads existing passphrase from disk", async () => {
    const dir = mkdtempSync(join(tmpdir(), "signet-pp-sw-read-"));
    writeFileSync(join(dir, "vault-passphrase"), "abcd1234".repeat(8));

    const provider = createSoftwarePassphraseProvider(dir);
    const result = await provider.getPassphrase();

    expect(Result.isOk(result)).toBe(true);
    if (Result.isError(result)) throw new Error("expected ok");
    expect(result.value).toBe("abcd1234".repeat(8));

    rmSync(dir, { recursive: true, force: true });
  });

  test("reports software kind", () => {
    const provider = createSoftwarePassphraseProvider(tmpDir);
    expect(provider.kind).toBe("software");
  });
});

describe("SePassphraseProvider (mock signer)", () => {
  let tmpDir: string;
  let mockSigner: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "signet-pp-se-"));

    // Mock signer that returns a fixed key ref on create and a fixed
    // signature on sign. This simulates the SE bridge protocol.
    const script = `#!/usr/bin/env bash
case "$1" in
  "create") echo '{"keyRef":"dGVzdC12YXVsdC1rZXk=","publicKey":"04abcdef1234","policy":"open"}' ;;
  "sign") echo '{"signature":"3045022100deadbeef0000000000000000000000000000000000000000000000000000000002200000000000000000000000000000000000000000000000000000000000000001"}' ;;
  *) echo '{}' ;;
esac
exit 0
`;
    mockSigner = join(tmpDir, "mock-signet-signer");
    writeFileSync(mockSigner, script);
    chmodSync(mockSigner, 0o755);
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("creates SE key on first call and derives passphrase", async () => {
    const dataDir = join(tmpDir, "data1");
    const provider = createSePassphraseProvider(dataDir, mockSigner);
    const result = await provider.getPassphrase();

    expect(Result.isOk(result)).toBe(true);
    if (Result.isError(result)) throw new Error("expected ok");

    // Derived passphrase is a hex string
    expect(result.value).toMatch(/^[0-9a-f]{64}$/);

    // Key reference persisted
    expect(existsSync(join(dataDir, "se-vault-keyref"))).toBe(true);
  });

  test("reuses existing key ref on subsequent calls", async () => {
    const dataDir = join(tmpDir, "data2");
    const provider = createSePassphraseProvider(dataDir, mockSigner);

    const r1 = await provider.getPassphrase();
    const r2 = await provider.getPassphrase();

    expect(Result.isOk(r1)).toBe(true);
    expect(Result.isOk(r2)).toBe(true);
    if (Result.isError(r1) || Result.isError(r2)) throw new Error("fail");

    // Same passphrase (deterministic derivation from same signature)
    expect(r1.value).toBe(r2.value);
  });

  test("reports secure-enclave kind", () => {
    const dataDir = join(tmpDir, "data3");
    const provider = createSePassphraseProvider(dataDir, mockSigner);
    expect(provider.kind).toBe("secure-enclave");
  });

  test("returns error when signer fails", async () => {
    const failSigner = join(tmpDir, "fail-signer");
    writeFileSync(
      failSigner,
      '#!/usr/bin/env bash\necho "error: SE unavailable" >&2\nexit 1\n',
    );
    chmodSync(failSigner, 0o755);

    const dataDir = join(tmpDir, "data-fail");
    const provider = createSePassphraseProvider(dataDir, failSigner);
    const result = await provider.getPassphrase();

    expect(Result.isError(result)).toBe(true);
  });
});

describe("resolvePassphraseProvider", () => {
  test("returns a provider with software or secure-enclave kind", () => {
    const dir = mkdtempSync(join(tmpdir(), "signet-pp-resolve-"));
    const provider = resolvePassphraseProvider(dir);

    expect(
      provider.kind === "software" || provider.kind === "secure-enclave",
    ).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });
});

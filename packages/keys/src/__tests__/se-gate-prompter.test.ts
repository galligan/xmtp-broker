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
import { createSeGatePrompter } from "../se-gate-prompter.js";

describe("SeGatePrompter (mock signer)", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "signet-gate-"));
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("creates gate key and succeeds on biometric confirmation", async () => {
    const mockSigner = join(tmpDir, "mock-signer-ok");
    writeFileSync(
      mockSigner,
      `#!/usr/bin/env bash
case "$1" in
  "create") echo '{"keyRef":"Z2F0ZS1rZXk=","publicKey":"04aabbccdd","policy":"biometric"}' ;;
  "sign") echo '{"signature":"3045022100abcdef"}' ;;
  *) echo '{}' ;;
esac
exit 0
`,
    );
    chmodSync(mockSigner, 0o755);

    const dataDir = join(tmpDir, "gate1");
    const prompter = createSeGatePrompter(dataDir, mockSigner);
    const result = await prompter("scopeExpansion");

    expect(Result.isOk(result)).toBe(true);

    // Gate key reference persisted
    expect(existsSync(join(dataDir, "se-gate-keyref"))).toBe(true);
  });

  test("returns CancelledError when user cancels biometric", async () => {
    // Signer that creates ok but returns exit 2 (auth cancelled) on sign
    const mockSigner = join(tmpDir, "mock-signer-cancel");
    writeFileSync(
      mockSigner,
      `#!/usr/bin/env bash
case "$1" in
  "create") echo '{"keyRef":"Z2F0ZS1rZXk=","publicKey":"04aabbccdd","policy":"biometric"}' ;;
  "sign") echo "error: authentication cancelled" >&2; exit 2 ;;
  *) echo '{}' ;;
esac
`,
    );
    chmodSync(mockSigner, 0o755);

    const dataDir = join(tmpDir, "gate2");
    const prompter = createSeGatePrompter(dataDir, mockSigner);
    const result = await prompter("agentCreation");

    expect(Result.isError(result)).toBe(true);
    if (Result.isOk(result)) throw new Error("expected error");
    expect(result.error._tag).toBe("CancelledError");
  });

  test("returns error when signer fails entirely", async () => {
    const mockSigner = join(tmpDir, "mock-signer-fail");
    writeFileSync(
      mockSigner,
      '#!/usr/bin/env bash\necho "error: SE unavailable" >&2\nexit 1\n',
    );
    chmodSync(mockSigner, 0o755);

    const dataDir = join(tmpDir, "gate3");
    const prompter = createSeGatePrompter(dataDir, mockSigner);
    const result = await prompter("rootKeyCreation");

    expect(Result.isError(result)).toBe(true);
  });

  test("reuses existing gate key ref on subsequent calls", async () => {
    const mockSigner = join(tmpDir, "mock-signer-reuse");
    writeFileSync(
      mockSigner,
      `#!/usr/bin/env bash
case "$1" in
  "create") echo '{"keyRef":"cmV1c2U=","publicKey":"04112233","policy":"biometric"}' ;;
  "sign") echo '{"signature":"3045022100aabb"}' ;;
  *) echo '{}' ;;
esac
exit 0
`,
    );
    chmodSync(mockSigner, 0o755);

    const dataDir = join(tmpDir, "gate4");
    const prompter = createSeGatePrompter(dataDir, mockSigner);

    // First call creates the key
    const r1 = await prompter("scopeExpansion");
    expect(Result.isOk(r1)).toBe(true);

    // Second call reuses it (doesn't call create again)
    const r2 = await prompter("egressExpansion");
    expect(Result.isOk(r2)).toBe(true);
  });
});

import { Result } from "better-result";
import { CancelledError, InternalError } from "@xmtp/signet-schemas";
import type { SignetError } from "@xmtp/signet-schemas";
import { join } from "node:path";
import { existsSync, chmodSync, mkdirSync } from "node:fs";
import { sha256 } from "@noble/hashes/sha256";
import { seCreate, seSign, findSignerBinary } from "./se-bridge.js";
import { detectPlatform } from "./platform.js";
import type { GatedOperation, BiometricPrompter } from "./biometric-gate.js";

const ENCODER = new TextEncoder();

/**
 * Create a biometric prompter backed by the Secure Enclave.
 *
 * Uses a separate SE key with `biometric` policy — every privileged
 * operation triggers a Touch ID prompt by signing an operation-specific
 * challenge with the biometric-gated key.
 *
 * This is distinct from the vault passphrase key (which uses `open`
 * policy). Two SE keys, two purposes:
 *
 * 1. Vault key (`open`) — daemon can start unattended
 * 2. Gate key (`biometric`) — privileged ops require physical presence
 *
 * @param dataDir - Root data directory (gate key reference stored here)
 * @param signerPath - Path to the signet-signer binary
 */
export function createSeGatePrompter(
  dataDir: string,
  signerPath: string,
): BiometricPrompter {
  const gateKeyRefPath = join(dataDir, "se-gate-keyref");
  let inflightKeyRef: Promise<Result<string, SignetError>> | null = null;

  /** Ensure the biometric SE key exists and return its reference. */
  async function ensureGateKey(): Promise<Result<string, SignetError>> {
    if (existsSync(gateKeyRefPath)) {
      return Result.ok(await Bun.file(gateKeyRefPath).text());
    }

    if (inflightKeyRef !== null) {
      return inflightKeyRef;
    }

    inflightKeyRef = (async (): Promise<Result<string, SignetError>> => {
      try {
        if (!existsSync(dataDir)) {
          mkdirSync(dataDir, { recursive: true });
          chmodSync(dataDir, 0o700);
        }

        if (existsSync(gateKeyRefPath)) {
          return Result.ok(await Bun.file(gateKeyRefPath).text());
        }

        // First privileged operation: create the biometric SE key
        const createResult = await seCreate(
          "signet-gate-biometric",
          "biometric",
          signerPath,
        );
        if (Result.isError(createResult)) {
          return Result.err(
            InternalError.create("Failed to create SE biometric gate key", {
              cause: createResult.error.message,
            }),
          );
        }

        const keyRef = createResult.value.keyRef;
        await Bun.write(gateKeyRefPath, keyRef);
        chmodSync(gateKeyRefPath, 0o600);
        return Result.ok(keyRef);
      } catch (cause) {
        return Result.err(
          InternalError.create("SE biometric gate prompter failed", {
            cause: String(cause),
          }),
        );
      } finally {
        inflightKeyRef = null;
      }
    })();

    return inflightKeyRef;
  }

  return async (
    operation: GatedOperation,
  ): Promise<Result<void, SignetError>> => {
    const keyRefResult = await ensureGateKey();
    if (Result.isError(keyRefResult)) return keyRefResult;

    // Sign an operation-specific challenge — Touch ID prompt fires here
    const challenge = sha256(
      ENCODER.encode(`signet-gate-challenge:${operation}:${Date.now()}`),
    );

    const signResult = await seSign(keyRefResult.value, challenge, signerPath);

    if (Result.isError(signResult)) {
      const msg = signResult.error.message;
      if (msg.includes("cancelled") || msg.includes("cancel")) {
        return Result.err(
          CancelledError.create(
            `Biometric authentication cancelled for ${operation}`,
          ),
        );
      }
      return Result.err(
        InternalError.create(
          `Biometric authentication failed for ${operation}`,
          { cause: msg },
        ),
      );
    }

    // Signature succeeded — biometric was confirmed
    return Result.ok(undefined);
  };
}

/**
 * Resolve the appropriate biometric prompter for the current platform.
 *
 * On macOS with SE: returns an SE-backed prompter that triggers Touch ID.
 * Otherwise: returns a fail-closed prompter that rejects gated operations
 * with an error. Prevents configured biometric enforcement from being
 * silently bypassed on unsupported platforms.
 *
 * @param dataDir - Root data directory for gate key reference
 */
export function resolveGatePrompter(dataDir: string): BiometricPrompter {
  const platform = detectPlatform();

  if (platform === "secure-enclave") {
    const signerPath = findSignerBinary();
    if (signerPath) {
      return createSeGatePrompter(dataDir, signerPath);
    }
  }

  // Fail-closed prompter for non-SE platforms — gated operations are
  // rejected because biometric enforcement cannot be provided.
  // If the deployment doesn't need biometric gating, all gate config
  // toggles should be set to false (the default).
  return async (
    operation: GatedOperation,
  ): Promise<Result<void, SignetError>> => {
    return Result.err(
      InternalError.create(
        `Biometric gate unavailable for ${operation}: Secure Enclave not detected. ` +
          `Disable biometric gating in config or run on an SE-capable platform.`,
      ),
    );
  };
}

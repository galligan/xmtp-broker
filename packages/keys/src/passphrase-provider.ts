import { Result } from "better-result";
import { InternalError } from "@xmtp/signet-schemas";
import { join } from "node:path";
import { existsSync, chmodSync } from "node:fs";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { seCreate, seSign, findSignerBinary } from "./se-bridge.js";
import { detectPlatform } from "./platform.js";

const ENCODER = new TextEncoder();

/** Fixed label used to derive the vault passphrase from an SE signature. */
const SE_VAULT_LABEL = "signet-vault-passphrase-v1";

/** File that stores the SE key reference for vault passphrase derivation. */
const SE_KEYREF_FILENAME = "se-vault-keyref";

/**
 * Provides the vault passphrase. Implementations may derive it from
 * hardware (Secure Enclave), read it from a file, or accept it as input.
 */
export interface PassphraseProvider {
  /** Resolve the vault passphrase. */
  getPassphrase(): Promise<Result<string, InternalError>>;
  /** Which provider type this is. */
  readonly kind: "secure-enclave" | "software";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Derive a deterministic passphrase from an SE signature.
 *
 * The SE key signs a fixed label. The signature is fed through HKDF-SHA256
 * to produce a 32-byte passphrase. Because SE signing is deterministic for
 * P-256 (RFC 6979), the same key + label always produces the same passphrase.
 */
function derivePassphraseFromSignature(signature: string): string {
  const sigBytes = new Uint8Array(
    signature.match(/.{2}/g)!.map((h) => parseInt(h, 16)),
  );
  const derived = hkdf(
    sha256,
    sigBytes,
    ENCODER.encode("signet-vault-kdf-salt"),
    "signet-vault-passphrase",
    32,
  );
  return bytesToHex(derived);
}

// ---------------------------------------------------------------------------
// Secure Enclave provider
// ---------------------------------------------------------------------------

/**
 * Create a passphrase provider backed by the Secure Enclave.
 *
 * On first run: creates an SE key with `open` policy (no biometric prompt
 * for vault access), signs the fixed label to derive the passphrase, and
 * stores the key reference to disk.
 *
 * On subsequent runs: loads the key reference from disk, re-signs the
 * label to rederive the same passphrase.
 *
 * The vault passphrase never exists on disk — it's derived in memory from
 * hardware-bound key material.
 *
 * @param dataDir - Root data directory (key reference stored here)
 * @param signerPath - Path to the signet-signer binary
 */
export function createSePassphraseProvider(
  dataDir: string,
  signerPath: string,
): PassphraseProvider {
  let cached: string | null = null;

  return {
    kind: "secure-enclave",

    async getPassphrase(): Promise<Result<string, InternalError>> {
      if (cached !== null) return Result.ok(cached);

      const keyRefPath = join(dataDir, SE_KEYREF_FILENAME);
      let keyRef: string;

      if (existsSync(keyRefPath)) {
        // Load existing key reference
        keyRef = await Bun.file(keyRefPath).text();
      } else {
        // First run: create SE key with open policy
        const createResult = await seCreate(
          "signet-vault-root",
          "open",
          signerPath,
        );
        if (Result.isError(createResult)) {
          return Result.err(
            InternalError.create("Failed to create SE vault key", {
              cause: createResult.error.message,
            }),
          );
        }

        keyRef = createResult.value.keyRef;

        // Persist key reference
        await Bun.write(keyRefPath, keyRef);
        chmodSync(keyRefPath, 0o600);
      }

      // Sign the fixed label to derive passphrase
      const labelHash = sha256(ENCODER.encode(SE_VAULT_LABEL));
      const signResult = await seSign(keyRef, labelHash, signerPath);
      if (Result.isError(signResult)) {
        return Result.err(
          InternalError.create("Failed to derive vault passphrase from SE", {
            cause: signResult.error.message,
          }),
        );
      }

      cached = derivePassphraseFromSignature(signResult.value.signature);
      return Result.ok(cached);
    },
  };
}

// ---------------------------------------------------------------------------
// Software provider
// ---------------------------------------------------------------------------

/**
 * Create a passphrase provider backed by a file on disk.
 *
 * On first run: generates a random 32-byte passphrase and writes it to
 * `dataDir/vault-passphrase` with 0o600 permissions.
 *
 * On subsequent runs: reads the passphrase from disk.
 *
 * This is the fallback for platforms without Secure Enclave support.
 *
 * @param dataDir - Root data directory (passphrase file stored here)
 */
export function createSoftwarePassphraseProvider(
  dataDir: string,
): PassphraseProvider {
  let cached: string | null = null;

  return {
    kind: "software",

    async getPassphrase(): Promise<Result<string, InternalError>> {
      if (cached !== null) return Result.ok(cached);

      const passphrasePath = join(dataDir, "vault-passphrase");

      try {
        if (existsSync(passphrasePath)) {
          cached = await Bun.file(passphrasePath).text();
        } else {
          const bytes = crypto.getRandomValues(new Uint8Array(32));
          cached = bytesToHex(bytes);
          await Bun.write(passphrasePath, cached);
          chmodSync(passphrasePath, 0o600);
        }
        return Result.ok(cached);
      } catch (e) {
        return Result.err(
          InternalError.create("Failed to resolve software passphrase", {
            cause: String(e),
          }),
        );
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Resolve the appropriate passphrase provider for the current platform.
 *
 * On macOS with Secure Enclave available: uses SE-backed provider.
 * Otherwise: falls back to software file-based provider.
 *
 * @param dataDir - Root data directory for key reference or passphrase file
 */
export function resolvePassphraseProvider(dataDir: string): PassphraseProvider {
  const platform = detectPlatform();

  if (platform === "secure-enclave") {
    const signerPath = findSignerBinary();
    if (signerPath) {
      return createSePassphraseProvider(dataDir, signerPath);
    }
  }

  return createSoftwarePassphraseProvider(dataDir);
}

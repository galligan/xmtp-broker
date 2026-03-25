import { sha256 } from "@noble/hashes/sha256";
import { pbkdf2 } from "@noble/hashes/pbkdf2";
import { hmac } from "@noble/hashes/hmac";
import { sha512 } from "@noble/hashes/sha512";
import { keccak_256 } from "@noble/hashes/sha3";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { BIP39_ENGLISH_WORDLIST } from "./bip39-wordlist.js";

/** BIP-44 EVM derivation path for XMTP identity keys. */
export const EVM_PATH_PREFIX = "m/44'/60'/0'/0";

/** Ed25519 derivation path for seal signing keys. */
export const ED25519_PATH_PREFIX = "m/44'/501'";

/** Result of HD key derivation. */
export interface DerivedKey {
  readonly privateKey: Uint8Array;
  readonly publicKey: Uint8Array;
  readonly chainCode: Uint8Array;
}

/** Result of EVM key derivation. */
export interface DerivedEvmKey {
  readonly privateKey: Uint8Array;
  readonly publicKey: Uint8Array;
  readonly address: string;
}

/** Result of Ed25519 key derivation. */
export interface DerivedEd25519Key {
  readonly privateKey: Uint8Array;
  readonly publicKey: Uint8Array;
}

/**
 * Generate a BIP-39 mnemonic with 256 bits of entropy (24 words).
 *
 * Uses `crypto.getRandomValues` for entropy generation, SHA-256
 * for the checksum, and the standard English wordlist.
 */
export function generateMnemonic(): string {
  // 1. Generate 32 bytes (256 bits) of random entropy
  const entropy = new Uint8Array(32);
  crypto.getRandomValues(entropy);

  // 2. Compute SHA-256 checksum
  const checksumByte = sha256(entropy)[0];
  // For 256-bit entropy, checksum is 8 bits (first byte of hash)

  // 3. Build 264-bit buffer: 256 bits entropy + 8 bits checksum
  //    Split into 24 groups of 11 bits
  const words: string[] = [];
  const allBytes = new Uint8Array(33);
  allBytes.set(entropy);
  allBytes[32] = checksumByte ?? 0;

  for (let i = 0; i < 24; i++) {
    const bitOffset = i * 11;
    const index = extractBits(allBytes, bitOffset, 11);
    const word = BIP39_ENGLISH_WORDLIST[index];
    if (word === undefined) {
      throw new Error(`Invalid wordlist index: ${index}`);
    }
    words.push(word);
  }

  return words.join(" ");
}

/**
 * Convert a BIP-39 mnemonic to a 512-bit seed.
 *
 * Uses PBKDF2-SHA512 with the mnemonic as password and
 * `"mnemonic" + passphrase` as salt, 2048 iterations.
 */
export function mnemonicToSeed(
  mnemonic: string,
  passphrase?: string,
): Uint8Array {
  const password = new TextEncoder().encode(mnemonic.normalize("NFKD"));
  const salt = new TextEncoder().encode(
    `mnemonic${(passphrase ?? "").normalize("NFKD")}`,
  );
  return pbkdf2(sha512, password, salt, { c: 2048, dkLen: 64 });
}

/**
 * Derive a child key from a seed using a BIP-32 derivation path.
 *
 * Supports hardened derivation (indicated by `'` suffix) and
 * normal derivation. The path must start with `"m"`.
 */
export function derivePath(seed: Uint8Array, path: string): DerivedKey {
  const segments = parsePath(path);

  // Master key: HMAC-SHA512(key="Bitcoin seed", data=seed)
  const master = hmac(sha512, new TextEncoder().encode("Bitcoin seed"), seed);
  let privateKey: Uint8Array = new Uint8Array(master.slice(0, 32));
  let chainCode: Uint8Array = new Uint8Array(master.slice(32, 64));

  for (const segment of segments) {
    const derived = deriveChild(privateKey, chainCode, segment);
    privateKey = derived.privateKey;
    chainCode = derived.chainCode;
  }

  // Compute public key (secp256k1 uncompressed)
  const publicKey = secp256k1.getPublicKey(privateKey, false);

  return {
    privateKey: new Uint8Array(privateKey),
    publicKey: new Uint8Array(publicKey),
    chainCode: new Uint8Array(chainCode),
  };
}

/**
 * Derive an EVM key at the given index.
 *
 * Uses path `m/44'/60'/0'/0/{index}` per BIP-44 for Ethereum.
 * Returns the private key, uncompressed public key, and
 * checksumless 0x-prefixed address.
 */
export function deriveEvmKey(seed: Uint8Array, index: number): DerivedEvmKey {
  const path = `${EVM_PATH_PREFIX}/${index}`;
  const derived = derivePath(seed, path);

  // Address: keccak256(uncompressed_pubkey_without_prefix)[12:]
  const pubkeyWithoutPrefix = derived.publicKey.slice(1);
  const hash = keccak_256(pubkeyWithoutPrefix);
  const addressBytes = hash.slice(12);
  const address = `0x${bytesToHex(addressBytes)}`;

  return {
    privateKey: derived.privateKey,
    publicKey: derived.publicKey,
    address,
  };
}

/**
 * Derive an Ed25519 key at the given index.
 *
 * Uses SLIP-0010 style hardened-only derivation with path
 * `m/44'/501'/{index}'/0'` (Solana-style). The derived 32 bytes
 * are used directly as the Ed25519 private key seed.
 */
export function deriveEd25519Key(
  seed: Uint8Array,
  index: number,
): DerivedEd25519Key {
  const path = `${ED25519_PATH_PREFIX}/${index}'/0'`;
  const derived = deriveEd25519Path(seed, path);

  const publicKey = ed25519.getPublicKey(derived.privateKey);

  return {
    privateKey: new Uint8Array(derived.privateKey),
    publicKey: new Uint8Array(publicKey),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Parsed path segment with index and hardened flag. */
interface PathSegment {
  readonly index: number;
  readonly hardened: boolean;
}

/** Hardened offset constant for BIP-32. */
const HARDENED_OFFSET = 0x80000000;
/** Maximum unhardened BIP-32 path index (31-bit). */
const MAX_DERIVATION_INDEX = 0x7fffffff;

/**
 * Parse a BIP-32 derivation path string into segments.
 * Path must start with "m". Components may end with "'" for hardened.
 */
function parsePath(path: string): readonly PathSegment[] {
  if (path === "m") return [];

  const parts = path.split("/");
  if (parts[0] !== "m") {
    throw new Error(`Invalid derivation path: must start with "m"`);
  }

  const segments: PathSegment[] = [];
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (part === undefined || part === "") {
      throw new Error(`Invalid derivation path: empty segment`);
    }
    const hardened = part.endsWith("'");
    const indexStr = hardened ? part.slice(0, -1) : part;
    if (!/^\d+$/.test(indexStr)) {
      throw new Error(`Invalid derivation path segment: "${part}"`);
    }
    const index = Number.parseInt(indexStr, 10);
    if (!Number.isFinite(index) || index < 0 || index > MAX_DERIVATION_INDEX) {
      throw new Error(`Invalid derivation path segment: "${part}"`);
    }
    segments.push({ index, hardened });
  }

  return segments;
}

/**
 * Derive a child key from parent key and chain code (BIP-32 secp256k1).
 */
function deriveChild(
  parentKey: Uint8Array,
  parentChainCode: Uint8Array,
  segment: PathSegment,
): { privateKey: Uint8Array; chainCode: Uint8Array } {
  const data = new Uint8Array(37);

  if (segment.hardened) {
    // Hardened: 0x00 || parentKey || index (big-endian)
    data[0] = 0x00;
    data.set(parentKey, 1);
  } else {
    // Normal: compressed public key || index (big-endian)
    const pubkey = secp256k1.getPublicKey(parentKey, true);
    data.set(pubkey, 0);
  }

  const childIndex = segment.hardened
    ? (segment.index + HARDENED_OFFSET) >>> 0
    : segment.index;

  // Write index as big-endian uint32
  data[33] = (childIndex >>> 24) & 0xff;
  data[34] = (childIndex >>> 16) & 0xff;
  data[35] = (childIndex >>> 8) & 0xff;
  data[36] = childIndex & 0xff;

  const derived = hmac(sha512, parentChainCode, data);
  const childKeyBytes = derived.slice(0, 32);
  const childChainCode = derived.slice(32, 64);

  // For secp256k1: child key = parse256(IL) + parentKey (mod n)
  const parentBigInt = bytesToBigInt(parentKey);
  const childBigInt = bytesToBigInt(childKeyBytes);
  const n = secp256k1.Point.Fn.ORDER;
  const result = (parentBigInt + childBigInt) % n;

  return {
    privateKey: bigIntToBytes(result, 32),
    chainCode: new Uint8Array(childChainCode),
  };
}

/**
 * SLIP-0010 Ed25519 derivation (hardened-only).
 * Uses "ed25519 seed" as the master key and always uses hardened derivation.
 */
function deriveEd25519Path(
  seed: Uint8Array,
  path: string,
): { privateKey: Uint8Array; chainCode: Uint8Array } {
  const segments = parsePath(path);

  // Master key: HMAC-SHA512(key="ed25519 seed", data=seed)
  const master = hmac(sha512, new TextEncoder().encode("ed25519 seed"), seed);
  let privateKey = master.slice(0, 32);
  let chainCode = master.slice(32, 64);

  for (const segment of segments) {
    // SLIP-0010: Ed25519 only supports hardened derivation
    const data = new Uint8Array(37);
    data[0] = 0x00;
    data.set(privateKey, 1);

    const childIndex = (segment.index + HARDENED_OFFSET) >>> 0;
    data[33] = (childIndex >>> 24) & 0xff;
    data[34] = (childIndex >>> 16) & 0xff;
    data[35] = (childIndex >>> 8) & 0xff;
    data[36] = childIndex & 0xff;

    const derived = hmac(sha512, chainCode, data);
    privateKey = derived.slice(0, 32);
    chainCode = derived.slice(32, 64);
  }

  return {
    privateKey: new Uint8Array(privateKey),
    chainCode: new Uint8Array(chainCode),
  };
}

/**
 * Extract `numBits` bits starting at `bitOffset` from a byte array.
 * Returns a number (up to 16 bits).
 */
function extractBits(
  data: Uint8Array,
  bitOffset: number,
  numBits: number,
): number {
  let value = 0;
  for (let i = 0; i < numBits; i++) {
    const byteIndex = Math.floor((bitOffset + i) / 8);
    const bitIndex = 7 - ((bitOffset + i) % 8);
    const byte = data[byteIndex];
    if (byte === undefined) {
      throw new Error(`Bit extraction out of bounds at byte ${byteIndex}`);
    }
    if ((byte >> bitIndex) & 1) {
      value |= 1 << (numBits - 1 - i);
    }
  }
  return value;
}

/** Convert Uint8Array to BigInt (big-endian). */
function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte === undefined) {
      throw new Error(`Byte access out of bounds at index ${i}`);
    }
    result = (result << 8n) | BigInt(byte);
  }
  return result;
}

/** Convert BigInt to Uint8Array (big-endian, fixed width). */
function bigIntToBytes(value: bigint, length: number): Uint8Array {
  const result = new Uint8Array(length);
  let remaining = value;
  for (let i = length - 1; i >= 0; i--) {
    result[i] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return result;
}

/** Convert bytes to lowercase hex string. */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

import { Result } from "better-result";
import { p256 } from "@noble/curves/nist.js";
import type { SigstoreBundle } from "./sigstore-bundle.js";

/** UTF-8 text encoder shared across calls. */
const encoder = new TextEncoder();

/** Expected length of a compact ECDSA signature (r || s). */
const COMPACT_SIG_LENGTH = 64;

/**
 * Compute the DSSE Pre-Authentication Encoding (PAE).
 *
 * Format: `"DSSEv1" SP len(type) SP type SP len(body) SP body`
 * where lengths are byte lengths encoded as ASCII decimal and SP
 * is a single space (0x20). The body is the raw payload bytes
 * (decoded from base64), per the DSSE specification.
 */
export function computePae(
  payloadType: string,
  payload: Uint8Array,
): Uint8Array {
  const typeBytes = encoder.encode(payloadType);
  const typeLenStr = String(typeBytes.length);
  const bodyLenStr = String(payload.length);

  // "DSSEv1 <typeLen> <type> <bodyLen> <body>"
  const prefix = encoder.encode(`DSSEv1 ${typeLenStr} `);
  const middle = encoder.encode(` ${bodyLenStr} `);

  const result = new Uint8Array(
    prefix.length + typeBytes.length + middle.length + payload.length,
  );
  let offset = 0;

  result.set(prefix, offset);
  offset += prefix.length;
  result.set(typeBytes, offset);
  offset += typeBytes.length;
  result.set(middle, offset);
  offset += middle.length;
  result.set(payload, offset);

  return result;
}

/**
 * Parse a DER-encoded ECDSA signature into 64-byte compact form
 * (r || s, each zero-padded to 32 bytes).
 *
 * DER layout: SEQUENCE { INTEGER r, INTEGER s }
 */
function derSigToCompact(der: Uint8Array): Result<Uint8Array, string> {
  if (der.length === COMPACT_SIG_LENGTH) {
    // Already compact format
    return Result.ok(der);
  }

  // Minimal DER: 0x30 <len> 0x02 <rLen> <r...> 0x02 <sLen> <s...>
  if (der.length < 8 || der[0] !== 0x30) {
    return Result.err("Not a DER-encoded signature");
  }

  let pos = 2; // skip SEQUENCE tag + length byte(s)
  // Handle long-form length on outer SEQUENCE
  if (der[1]! >= 0x80) {
    pos = 2 + (der[1]! & 0x7f);
  }

  const compact = new Uint8Array(COMPACT_SIG_LENGTH);

  // Parse INTEGER r
  if (der[pos] !== 0x02) {
    return Result.err("Expected INTEGER tag for r");
  }
  pos += 1;
  const rLen = der[pos]!;
  pos += 1;
  // Strip leading zero padding, right-align into 32 bytes
  const rResult = copyIntegerToFixed(der, pos, rLen, compact, 0, 32);
  if (!rResult.isOk()) return Result.err(rResult.error);
  pos += rLen;

  // Parse INTEGER s
  if (der[pos] !== 0x02) {
    return Result.err("Expected INTEGER tag for s");
  }
  pos += 1;
  const sLen = der[pos]!;
  pos += 1;
  const sResult = copyIntegerToFixed(der, pos, sLen, compact, 32, 32);
  if (!sResult.isOk()) return Result.err(sResult.error);

  return Result.ok(compact);
}

/**
 * Copy a DER INTEGER value into a fixed-width buffer, handling
 * leading zero bytes and right-alignment.
 */
function copyIntegerToFixed(
  src: Uint8Array,
  srcOffset: number,
  srcLen: number,
  dst: Uint8Array,
  dstOffset: number,
  fieldSize: number,
): Result<void, string> {
  let start = srcOffset;
  let len = srcLen;

  // Strip leading zero (sign byte for positive integers)
  if (len > fieldSize && src[start] === 0x00) {
    start += 1;
    len -= 1;
  }

  if (len > fieldSize) {
    return Result.err(
      `DER integer too large: ${len} bytes for ${fieldSize}-byte field`,
    );
  }

  // Right-align: pad with zeros on the left if shorter
  const padLen = fieldSize - len;
  if (padLen > 0) {
    dst.fill(0, dstOffset, dstOffset + padLen);
  }
  dst.set(src.subarray(start, start + len), dstOffset + padLen);
  return Result.ok(undefined);
}

/**
 * Verify the DSSE signature on a Sigstore bundle using the
 * extracted P-256 public key.
 *
 * Computes the PAE encoding of the envelope, then verifies the
 * first non-empty signature against the public key using
 * ECDSA-P256-SHA256 (p256 hashes with SHA-256 by default).
 */
export function verifyDsseSignature(
  bundle: SigstoreBundle,
  publicKey: Uint8Array,
): Result<true, string> {
  const { dsseEnvelope } = bundle;

  // Find first non-empty signature
  const sigEntry = dsseEnvelope.signatures.find((s) => s.sig.length > 0);
  if (sigEntry === undefined) {
    return Result.err("No non-empty signature in DSSE envelope");
  }

  // Decode the base64 signature
  let sigDerBytes: Uint8Array;
  try {
    const binary = atob(sigEntry.sig);
    sigDerBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      sigDerBytes[i] = binary.charCodeAt(i);
    }
  } catch {
    return Result.err("Signature is not valid base64");
  }

  // Convert DER signature to compact format for @noble/curves v2
  const compactResult = derSigToCompact(sigDerBytes);
  if (!compactResult.isOk()) {
    return Result.err(`Signature format error: ${compactResult.error}`);
  }

  // Decode payload from base64 to raw bytes for PAE
  let payloadBytes: Uint8Array;
  try {
    const binary = atob(dsseEnvelope.payload);
    payloadBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      payloadBytes[i] = binary.charCodeAt(i);
    }
  } catch {
    return Result.err("Payload is not valid base64");
  }

  // Compute PAE over the decoded payload bytes per DSSE spec
  const pae = computePae(dsseEnvelope.payloadType, payloadBytes);

  // Verify with p256 (hashes PAE with SHA-256 internally)
  let valid: boolean;
  try {
    valid = p256.verify(compactResult.value, pae, publicKey);
  } catch {
    return Result.err("Signature verification threw an error");
  }

  if (!valid) {
    return Result.err("DSSE signature is invalid");
  }

  return Result.ok(true);
}

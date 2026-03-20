import { Result } from "better-result";

/** Tag byte for ASN.1 SEQUENCE. */
const TAG_SEQUENCE = 0x30;

/** Tag byte for ASN.1 BIT STRING. */
const TAG_BIT_STRING = 0x03;

/**
 * EC public key algorithm OID (1.2.840.10045.2.1).
 * DER encoding: 06 07 2a 86 48 ce 3d 02 01
 */
const EC_PUBLIC_KEY_OID = new Uint8Array([
  0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
]);

/**
 * secp256r1 (P-256) curve OID (1.2.840.10045.3.1.7).
 * DER encoding: 06 08 2a 86 48 ce 3d 03 01 07
 */
const SECP256R1_OID = new Uint8Array([
  0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07,
]);

/** Expected length of an uncompressed P-256 public key. */
const P256_UNCOMPRESSED_LENGTH = 65;

/** Prefix byte for uncompressed EC points. */
const UNCOMPRESSED_POINT_PREFIX = 0x04;

/**
 * Parse a DER TLV (Tag-Length-Value) element at the given offset.
 * Returns the tag, content start, content length, and total element
 * length. Handles both short-form and long-form DER length encoding.
 */
function parseTlv(
  der: Uint8Array,
  offset: number,
): Result<
  {
    tag: number;
    contentStart: number;
    contentLength: number;
    totalLength: number;
  },
  string
> {
  if (offset >= der.length) {
    return Result.err("Unexpected end of DER data");
  }

  const tag = der[offset]!;
  let pos = offset + 1;

  if (pos >= der.length) {
    return Result.err("Truncated DER: missing length");
  }

  const firstLenByte = der[pos]!;
  pos += 1;

  let contentLength: number;

  if (firstLenByte < 0x80) {
    // Short form: length is the byte value itself
    contentLength = firstLenByte;
  } else if (firstLenByte === 0x80) {
    return Result.err("Indefinite length not supported");
  } else {
    // Long form: firstLenByte & 0x7f = number of length bytes
    const numLenBytes = firstLenByte & 0x7f;
    if (numLenBytes > 4) {
      return Result.err("DER length exceeds 4 bytes");
    }
    if (pos + numLenBytes > der.length) {
      return Result.err("Truncated DER: incomplete length");
    }
    contentLength = 0;
    for (let i = 0; i < numLenBytes; i++) {
      contentLength = (contentLength << 8) | der[pos + i]!;
    }
    pos += numLenBytes;
  }

  if (pos + contentLength > der.length) {
    return Result.err("Truncated DER: content exceeds buffer");
  }

  return Result.ok({
    tag,
    contentStart: pos,
    contentLength,
    totalLength: pos - offset + contentLength,
  });
}

/**
 * Check if a byte slice at the given offset matches a reference pattern.
 */
function bytesMatch(
  data: Uint8Array,
  offset: number,
  pattern: Uint8Array,
): boolean {
  if (offset + pattern.length > data.length) return false;
  for (let i = 0; i < pattern.length; i++) {
    if (data[offset + i] !== pattern[i]) return false;
  }
  return true;
}

/**
 * Find a SEQUENCE containing the EC algorithm OID within the given
 * DER range. Returns the content start and length of the matching
 * SEQUENCE, or null if not found.
 */
function findSpki(
  der: Uint8Array,
  rangeStart: number,
  rangeEnd: number,
): { contentStart: number; contentLength: number } | null {
  let pos = rangeStart;
  while (pos < rangeEnd) {
    const tlv = parseTlv(der, pos);
    if (!tlv.isOk()) break;

    const { tag, contentStart, contentLength, totalLength } = tlv.value;

    if (tag === TAG_SEQUENCE) {
      // Check if this SEQUENCE starts with the EC algorithm OID
      // The algorithm identifier SEQUENCE contains: OID ecPublicKey, OID curve
      const innerTlv = parseTlv(der, contentStart);
      if (innerTlv.isOk() && innerTlv.value.tag === TAG_SEQUENCE) {
        // Check if inner SEQUENCE contains EC OID
        if (bytesMatch(der, innerTlv.value.contentStart, EC_PUBLIC_KEY_OID)) {
          return { contentStart, contentLength };
        }
      }
    }

    pos += totalLength;
  }
  return null;
}

/**
 * Extract an uncompressed P-256 public key from a base64-encoded
 * X.509 certificate.
 *
 * Walks the DER TLV tree: cert -> tbsCertificate ->
 * subjectPublicKeyInfo -> BIT STRING. Verifies the secp256r1 OID
 * (1.2.840.10045.3.1.7) before returning the raw 65-byte key.
 */
export function extractP256PublicKey(
  certBase64: string,
): Result<Uint8Array, string> {
  // Decode base64
  let der: Uint8Array;
  try {
    const binary = atob(certBase64);
    der = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      der[i] = binary.charCodeAt(i);
    }
  } catch {
    return Result.err("Invalid base64 in certificate");
  }

  // Parse outer SEQUENCE (Certificate)
  const cert = parseTlv(der, 0);
  if (!cert.isOk()) return Result.err(`Certificate: ${cert.error}`);
  if (cert.value.tag !== TAG_SEQUENCE) {
    return Result.err("Certificate is not a SEQUENCE");
  }

  // Parse first child SEQUENCE (tbsCertificate)
  const tbs = parseTlv(der, cert.value.contentStart);
  if (!tbs.isOk()) {
    return Result.err(`tbsCertificate: ${tbs.error}`);
  }
  if (tbs.value.tag !== TAG_SEQUENCE) {
    return Result.err("tbsCertificate is not a SEQUENCE");
  }

  // Scan tbsCertificate for subjectPublicKeyInfo (SEQUENCE with EC OID)
  const tbsEnd = tbs.value.contentStart + tbs.value.contentLength;
  const spki = findSpki(der, tbs.value.contentStart, tbsEnd);
  if (spki === null) {
    return Result.err("subjectPublicKeyInfo with EC algorithm not found");
  }

  // Parse the algorithm identifier SEQUENCE inside SPKI
  const algId = parseTlv(der, spki.contentStart);
  if (!algId.isOk()) {
    return Result.err(`AlgorithmIdentifier: ${algId.error}`);
  }

  // Verify EC public key OID
  if (!bytesMatch(der, algId.value.contentStart, EC_PUBLIC_KEY_OID)) {
    return Result.err("Algorithm is not EC public key");
  }

  // Verify secp256r1 curve OID follows the EC OID
  const curveOidOffset = algId.value.contentStart + EC_PUBLIC_KEY_OID.length;
  if (!bytesMatch(der, curveOidOffset, SECP256R1_OID)) {
    return Result.err("Curve is not secp256r1 (P-256)");
  }

  // Find the BIT STRING after the algorithm identifier
  const bitStringOffset = spki.contentStart + algId.value.totalLength;
  const bitString = parseTlv(der, bitStringOffset);
  if (!bitString.isOk()) {
    return Result.err(`BIT STRING: ${bitString.error}`);
  }
  if (bitString.value.tag !== TAG_BIT_STRING) {
    return Result.err("Expected BIT STRING for public key");
  }

  // BIT STRING content: first byte is number of unused bits (0x00),
  // followed by the actual key bytes
  const unusedBits = der[bitString.value.contentStart];
  if (unusedBits !== 0x00) {
    return Result.err(
      `Unexpected unused bits in BIT STRING: ${String(unusedBits)}`,
    );
  }

  const keyStart = bitString.value.contentStart + 1;
  const keyLength = bitString.value.contentLength - 1;

  if (keyLength !== P256_UNCOMPRESSED_LENGTH) {
    return Result.err(
      `Expected ${String(P256_UNCOMPRESSED_LENGTH)}-byte key, ` +
        `got ${String(keyLength)}`,
    );
  }

  const publicKey = der.slice(keyStart, keyStart + keyLength);

  if (publicKey[0] !== UNCOMPRESSED_POINT_PREFIX) {
    return Result.err("Public key is not an uncompressed point");
  }

  return Result.ok(publicKey);
}

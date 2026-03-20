import { p256 } from "@noble/curves/nist.js";
import { computePae } from "../checks/dsse-verify.js";

// -- DER encoding helpers --

/** Encode a DER length value (short or long form). */
function derLength(len: number): Uint8Array {
  if (len < 0x80) {
    return new Uint8Array([len]);
  }
  if (len < 0x100) {
    return new Uint8Array([0x81, len]);
  }
  return new Uint8Array([0x82, (len >> 8) & 0xff, len & 0xff]);
}

/** Wrap content bytes in a DER TLV with the given tag. */
function derWrap(tag: number, content: Uint8Array): Uint8Array {
  const lenBytes = derLength(content.length);
  const result = new Uint8Array(1 + lenBytes.length + content.length);
  result[0] = tag;
  result.set(lenBytes, 1);
  result.set(content, 1 + lenBytes.length);
  return result;
}

/** Build a DER SEQUENCE from concatenated children. */
function derSequence(...children: Uint8Array[]): Uint8Array {
  let totalLen = 0;
  for (const c of children) totalLen += c.length;
  const content = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of children) {
    content.set(c, offset);
    offset += c.length;
  }
  return derWrap(0x30, content);
}

/** Build a DER INTEGER from raw bytes. */
function derInteger(value: Uint8Array): Uint8Array {
  let content: Uint8Array;
  if (value[0]! >= 0x80) {
    content = new Uint8Array(value.length + 1);
    content[0] = 0x00;
    content.set(value, 1);
  } else {
    content = value;
  }
  return derWrap(0x02, content);
}

/** Build a DER BIT STRING (with zero unused-bits prefix). */
function derBitString(content: Uint8Array): Uint8Array {
  const withPad = new Uint8Array(content.length + 1);
  withPad[0] = 0x00; // zero unused bits
  withPad.set(content, 1);
  return derWrap(0x03, withPad);
}

/** Build a DER UTF8String. */
function derUtf8String(value: string): Uint8Array {
  const encoded = new TextEncoder().encode(value);
  return derWrap(0x0c, encoded);
}

/** Build a DER UTCTime. */
function derUtcTime(date: Date): Uint8Array {
  const y = String(date.getUTCFullYear()).slice(2);
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  const s = String(date.getUTCSeconds()).padStart(2, "0");
  const timeStr = `${y}${m}${d}${h}${min}${s}Z`;
  return derWrap(0x17, new TextEncoder().encode(timeStr));
}

/** Raw OID bytes (tag + length + value). */
const OID_EC_PUBLIC_KEY = new Uint8Array([
  0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
]);
const OID_SECP256R1 = new Uint8Array([
  0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07,
]);
const OID_ECDSA_WITH_SHA256 = new Uint8Array([
  0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x02,
]);
const OID_COMMON_NAME = new Uint8Array([0x06, 0x03, 0x55, 0x04, 0x03]);

/**
 * Build a minimal self-signed X.509 v3 certificate in DER format.
 * Suitable for testing public key extraction.
 */
export function buildSelfSignedCertDer(
  privateKey: Uint8Array,
  publicKey: Uint8Array,
): Uint8Array {
  // Algorithm identifier for ecdsaWithSHA256
  const signatureAlgorithm = derSequence(OID_ECDSA_WITH_SHA256);

  // Issuer / Subject: CN=test
  const rdnSequence = derSequence(
    derWrap(
      0x31, // SET
      derSequence(OID_COMMON_NAME, derUtf8String("test")),
    ),
  );

  // Validity: now to +1 year
  const now = new Date();
  const later = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  const validity = derSequence(derUtcTime(now), derUtcTime(later));

  // SubjectPublicKeyInfo
  const algorithmId = derSequence(OID_EC_PUBLIC_KEY, OID_SECP256R1);
  const subjectPublicKeyInfo = derSequence(
    algorithmId,
    derBitString(publicKey),
  );

  // Version [0] EXPLICIT INTEGER 2 (v3)
  const version = derWrap(
    0xa0, // context-specific, constructed, tag 0
    derInteger(new Uint8Array([0x02])),
  );

  // Serial number
  const serialNumber = derInteger(new Uint8Array([0x01]));

  // tbsCertificate
  const tbsCertificate = derSequence(
    version,
    serialNumber,
    signatureAlgorithm,
    rdnSequence, // issuer
    validity,
    rdnSequence, // subject
    subjectPublicKeyInfo,
  );

  // Sign tbsCertificate (DER format)
  const sigBytes = p256.sign(tbsCertificate, privateKey, {
    format: "der",
  });

  // Full certificate
  return derSequence(
    tbsCertificate,
    signatureAlgorithm,
    derBitString(sigBytes),
  );
}

/**
 * Create a Sigstore bundle with a real P-256 signature for
 * testing. Returns a base64-encoded bundle string suitable
 * for use in verification requests.
 */
export function createCryptoBundle(options: {
  subjectDigest: string;
  subjectName?: string;
}): string {
  const privKey = p256.utils.randomSecretKey();
  const pubKey = p256.getPublicKey(privKey, false);
  const certDer = buildSelfSignedCertDer(privKey, pubKey);
  const certBase64 = btoa(String.fromCharCode(...certDer));

  const statement = {
    _type: "https://in-toto.io/Statement/v1",
    subject: [
      {
        name: options.subjectName ?? "artifact.tar.gz",
        digest: { sha256: options.subjectDigest },
      },
    ],
    predicateType: "https://slsa.dev/provenance/v1",
    predicate: {
      buildDefinition: {
        buildType: "https://actions.github.io/buildtypes/workflow/v1",
      },
      runDetails: {
        builder: {
          id: "https://github.com/actions/runner",
        },
      },
    },
  };

  const statementJson = JSON.stringify(statement);
  const payloadBase64 = btoa(statementJson);
  const payloadType = "application/vnd.in-toto+json";

  // Compute PAE over decoded payload bytes (per DSSE spec)
  const payloadBytes = new TextEncoder().encode(statementJson);
  const pae = computePae(payloadType, payloadBytes);
  const sigDer = p256.sign(pae, privKey, { format: "der" });
  const sigBase64 = btoa(String.fromCharCode(...sigDer));

  const bundle = {
    mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
    verificationMaterial: {
      certificate: { rawBytes: certBase64 },
      tlogEntries: [],
    },
    dsseEnvelope: {
      payload: payloadBase64,
      payloadType,
      signatures: [{ sig: sigBase64, keyid: "" }],
    },
  };

  return btoa(JSON.stringify(bundle));
}

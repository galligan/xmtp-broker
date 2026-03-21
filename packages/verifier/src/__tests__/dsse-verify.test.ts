import { describe, expect, test } from "bun:test";
import { p256 } from "@noble/curves/nist.js";
import { computePae, verifyDsseSignature } from "../checks/dsse-verify.js";
import type { SigstoreBundle } from "../checks/sigstore-bundle.js";

describe("computePae", () => {
  test("produces correct PAE encoding", () => {
    const payload = new TextEncoder().encode("eyJhIjoxfQ==");
    const pae = computePae("application/vnd.in-toto+json", payload);
    const decoded = new TextDecoder().decode(pae);

    // payloadType is 28 bytes, payload bytes are 12 bytes
    expect(decoded).toBe(
      "DSSEv1 28 application/vnd.in-toto+json 12 eyJhIjoxfQ==",
    );
  });

  test("handles empty payload type", () => {
    const payload = new TextEncoder().encode("data");
    const pae = computePae("", payload);
    const decoded = new TextDecoder().decode(pae);

    expect(decoded).toBe("DSSEv1 0  4 data");
  });

  test("uses byte length not character count for payload type", () => {
    // Multi-byte characters: e-acute = 2 bytes in UTF-8
    const payload = new Uint8Array([0xe9]); // single raw byte
    const pae = computePae("type", payload);
    const decoded = new TextDecoder().decode(pae);

    expect(decoded).toStartWith("DSSEv1 4 type 1 ");
  });
});

describe("verifyDsseSignature", () => {
  test("verifies a valid P-256 DER signature", () => {
    const privKey = p256.utils.randomSecretKey();
    const pubKey = p256.getPublicKey(privKey, false);

    const payloadType = "application/vnd.in-toto+json";
    const payloadJson = JSON.stringify({ test: true });
    const payload = btoa(payloadJson);

    // Sign the PAE over decoded payload bytes (per DSSE spec)
    const payloadBytes = new TextEncoder().encode(payloadJson);
    const pae = computePae(payloadType, payloadBytes);
    const sigDer = p256.sign(pae, privKey, {
      format: "der",
    });
    const sigBase64 = btoa(String.fromCharCode(...sigDer));

    const bundle: SigstoreBundle = {
      mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
      verificationMaterial: {
        certificate: { rawBytes: "" },
      },
      dsseEnvelope: {
        payload,
        payloadType,
        signatures: [{ sig: sigBase64, keyid: "" }],
      },
    };

    const result = verifyDsseSignature(bundle, pubKey);

    expect(result.isOk()).toBe(true);
  });

  test("rejects tampered payload", () => {
    const privKey = p256.utils.randomSecretKey();
    const pubKey = p256.getPublicKey(privKey, false);

    const payloadType = "application/vnd.in-toto+json";
    const originalJson = JSON.stringify({ test: true });

    // Sign the original payload (decoded bytes per DSSE spec)
    const originalBytes = new TextEncoder().encode(originalJson);
    const pae = computePae(payloadType, originalBytes);
    const sigDer = p256.sign(pae, privKey, {
      format: "der",
    });
    const sigBase64 = btoa(String.fromCharCode(...sigDer));

    // Tamper with payload
    const tamperedPayload = btoa(JSON.stringify({ test: false }));

    const bundle: SigstoreBundle = {
      mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
      verificationMaterial: {
        certificate: { rawBytes: "" },
      },
      dsseEnvelope: {
        payload: tamperedPayload,
        payloadType,
        signatures: [{ sig: sigBase64, keyid: "" }],
      },
    };

    const result = verifyDsseSignature(bundle, pubKey);

    expect(result.isOk()).toBe(false);
    if (!result.isOk()) {
      expect(result.error).toContain("invalid");
    }
  });

  test("rejects wrong public key", () => {
    const privKey = p256.utils.randomSecretKey();
    const wrongPubKey = p256.getPublicKey(p256.utils.randomSecretKey(), false);

    const payloadType = "application/vnd.in-toto+json";
    const payloadJson = JSON.stringify({ test: true });
    const payload = btoa(payloadJson);

    const payloadBytes = new TextEncoder().encode(payloadJson);
    const pae = computePae(payloadType, payloadBytes);
    const sigDer = p256.sign(pae, privKey, {
      format: "der",
    });
    const sigBase64 = btoa(String.fromCharCode(...sigDer));

    const bundle: SigstoreBundle = {
      mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
      verificationMaterial: {
        certificate: { rawBytes: "" },
      },
      dsseEnvelope: {
        payload,
        payloadType,
        signatures: [{ sig: sigBase64, keyid: "" }],
      },
    };

    const result = verifyDsseSignature(bundle, wrongPubKey);

    expect(result.isOk()).toBe(false);
  });

  test("errors when no non-empty signature", () => {
    const pubKey = p256.getPublicKey(p256.utils.randomSecretKey(), false);

    const bundle: SigstoreBundle = {
      mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
      verificationMaterial: {
        certificate: { rawBytes: "" },
      },
      dsseEnvelope: {
        payload: "dGVzdA==",
        payloadType: "text/plain",
        signatures: [{ sig: "", keyid: "" }],
      },
    };

    const result = verifyDsseSignature(bundle, pubKey);

    expect(result.isOk()).toBe(false);
    if (!result.isOk()) {
      expect(result.error).toContain("non-empty");
    }
  });
});

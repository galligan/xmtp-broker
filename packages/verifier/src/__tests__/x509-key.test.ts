import { describe, expect, test } from "bun:test";
import { p256 } from "@noble/curves/nist.js";
import { extractP256PublicKey } from "../checks/x509-key.js";
import { buildSelfSignedCertDer } from "./crypto-helpers.js";

describe("extractP256PublicKey", () => {
  test("extracts key from a self-signed P-256 certificate", () => {
    const privKey = p256.utils.randomSecretKey();
    const pubKey = p256.getPublicKey(privKey, false);
    const certDer = buildSelfSignedCertDer(privKey, pubKey);
    const certBase64 = btoa(String.fromCharCode(...certDer));

    const result = extractP256PublicKey(certBase64);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.length).toBe(65);
      expect(result.value[0]).toBe(0x04);
      expect(Buffer.from(result.value).toString("hex")).toBe(
        Buffer.from(pubKey).toString("hex"),
      );
    }
  });

  test("errors on invalid base64", () => {
    const result = extractP256PublicKey("!!!not-base64!!!");

    expect(result.isOk()).toBe(false);
    if (!result.isOk()) {
      expect(result.error).toContain("base64");
    }
  });

  test("errors on truncated DER", () => {
    // Just a SEQUENCE tag with no length
    const result = extractP256PublicKey(btoa("\x30"));

    expect(result.isOk()).toBe(false);
    if (!result.isOk()) {
      expect(result.error).toBeTruthy();
    }
  });

  test("errors when certificate has wrong curve OID", () => {
    const privKey = p256.utils.randomSecretKey();
    const pubKey = p256.getPublicKey(privKey, false);
    const certDer = buildSelfSignedCertDer(privKey, pubKey);

    // Find and corrupt the secp256r1 OID (last byte 0x07 -> 0x08)
    const corrupted = new Uint8Array(certDer);
    let found = false;
    for (let i = 0; i < corrupted.length - 9; i++) {
      if (
        corrupted[i] === 0x06 &&
        corrupted[i + 1] === 0x08 &&
        corrupted[i + 2] === 0x2a &&
        corrupted[i + 3] === 0x86 &&
        corrupted[i + 4] === 0x48 &&
        corrupted[i + 5] === 0xce &&
        corrupted[i + 6] === 0x3d &&
        corrupted[i + 7] === 0x03 &&
        corrupted[i + 8] === 0x01 &&
        corrupted[i + 9] === 0x07
      ) {
        corrupted[i + 9] = 0x08;
        found = true;
        break;
      }
    }
    expect(found).toBe(true);

    const certBase64 = btoa(String.fromCharCode(...corrupted));
    const result = extractP256PublicKey(certBase64);

    expect(result.isOk()).toBe(false);
    if (!result.isOk()) {
      expect(result.error).toContain("secp256r1");
    }
  });

  test("errors on non-certificate data", () => {
    const result = extractP256PublicKey(btoa("this is not a certificate"));

    expect(result.isOk()).toBe(false);
  });
});

import { deflateSync } from "node:zlib";
import { describe, expect, test } from "bun:test";
import { createInviteCrypto } from "../invite-crypto.js";

function buildCompressedPayload(
  plaintext: Uint8Array,
  declaredSize: number = plaintext.length,
): Uint8Array {
  const compressed = new Uint8Array(deflateSync(plaintext));
  const result = new Uint8Array(compressed.length + 5);
  result[0] = 0x1f;
  result[1] = (declaredSize >>> 24) & 0xff;
  result[2] = (declaredSize >>> 16) & 0xff;
  result[3] = (declaredSize >>> 8) & 0xff;
  result[4] = declaredSize & 0xff;
  result.set(compressed, 5);
  return result;
}

describe("createInviteCrypto", () => {
  test("rejects compressed payloads whose declared size exceeds the configured maximum", () => {
    const crypto = createInviteCrypto({
      salt: "TestInviteCrypto",
      maxDecompressedSize: 64,
    });

    const payload = buildCompressedPayload(
      new TextEncoder().encode("tiny"),
      65,
    );
    const result = crypto.decompress(payload, { errorField: "inviteUrl" });

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;

    expect(result.error.message).toContain("Decompressed size exceeds maximum");
  });

  test("returns a validation error when compressed data expands beyond maxOutputLength", () => {
    const crypto = createInviteCrypto({
      salt: "TestInviteCrypto",
      maxDecompressedSize: 64,
    });

    const payload = buildCompressedPayload(
      new TextEncoder().encode("A".repeat(1024)),
      1,
    );
    const result = crypto.decompress(payload, { errorField: "inviteUrl" });

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;

    expect(result.error.message).toContain("Failed to decompress invite data");
  });
});

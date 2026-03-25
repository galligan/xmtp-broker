import { describe, test, expect } from "bun:test";
import { createHandlerContext } from "../context-factory.js";
import { makeCredentialRecord, createMockSignerProvider } from "./fixtures.js";

describe("createHandlerContext", () => {
  const credentialRecord = makeCredentialRecord();
  const signerProvider = createMockSignerProvider();

  test("context has requestId in UUID format", () => {
    const ctx = createHandlerContext({
      signetId: "signet_1",
      signerProvider,
      credentialId: credentialRecord.credentialId,
      requestTimeoutMs: 30_000,
    });

    expect(ctx.requestId).toBeDefined();
    // UUID v4 format
    expect(ctx.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  test("context has signal as AbortSignal", () => {
    const ctx = createHandlerContext({
      signetId: "signet_1",
      signerProvider,
      credentialId: credentialRecord.credentialId,
      requestTimeoutMs: 30_000,
    });

    expect(ctx.signal).toBeInstanceOf(AbortSignal);
    expect(ctx.signal.aborted).toBe(false);
  });

  test("context has credentialId from credential record", () => {
    const ctx = createHandlerContext({
      signetId: "signet_1",
      signerProvider,
      credentialId: "cred_bbccddeefeedbabe",
      requestTimeoutMs: 30_000,
    });

    expect(ctx.credentialId).toBe("cred_bbccddeefeedbabe");
  });

  test("context does NOT have adminAuth", () => {
    const ctx = createHandlerContext({
      signetId: "signet_1",
      signerProvider,
      credentialId: credentialRecord.credentialId,
      requestTimeoutMs: 30_000,
    });

    expect(ctx.adminAuth).toBeUndefined();
  });
});

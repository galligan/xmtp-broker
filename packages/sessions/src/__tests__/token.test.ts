import { describe, expect, test } from "bun:test";
import { generateToken, generateSessionId } from "../token.js";

describe("generateToken", () => {
  test("returns a base64url-encoded string of 43 characters", () => {
    const token = generateToken();
    expect(token).toHaveLength(43);
  });

  test("contains only base64url-safe characters", () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test("generates unique tokens on each call", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateToken()));
    expect(tokens.size).toBe(100);
  });

  test("can be decoded back to 32 bytes", () => {
    const token = generateToken();
    // base64url decode
    const padded = token.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(padded, "base64");
    expect(decoded).toHaveLength(32);
  });
});

describe("generateSessionId", () => {
  test("starts with ses_ prefix", () => {
    const id = generateSessionId();
    expect(id.startsWith("ses_")).toBe(true);
  });

  test("has total length of 36 characters", () => {
    const id = generateSessionId();
    expect(id).toHaveLength(36);
  });

  test("hex portion contains only hex characters", () => {
    const id = generateSessionId();
    const hex = id.slice(4);
    expect(hex).toMatch(/^[0-9a-f]{32}$/);
  });

  test("generates unique IDs on each call", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateSessionId()));
    expect(ids.size).toBe(100);
  });
});

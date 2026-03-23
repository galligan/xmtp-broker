import { describe, expect, it } from "bun:test";
import { PolicyConfig, PolicyRecord, resolvePolicy } from "../policy.js";

// -- PolicyConfig -----------------------------------------------------------

const validConfig = {
  label: "Read Only",
  allow: ["read-messages", "list-conversations"] as const,
  deny: ["send", "react"] as const,
};

describe("PolicyConfig", () => {
  it("accepts valid config with allow and deny scopes", () => {
    const result = PolicyConfig.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it("accepts config with empty allow and deny arrays", () => {
    const result = PolicyConfig.safeParse({
      label: "Empty",
      allow: [],
      deny: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty label", () => {
    const result = PolicyConfig.safeParse({
      ...validConfig,
      label: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid scope in allow", () => {
    const result = PolicyConfig.safeParse({
      ...validConfig,
      allow: ["not-a-scope"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid scope in deny", () => {
    const result = PolicyConfig.safeParse({
      ...validConfig,
      deny: ["not-a-scope"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing label", () => {
    const result = PolicyConfig.safeParse({
      allow: ["send"],
      deny: [],
    });
    expect(result.success).toBe(false);
  });
});

// -- PolicyRecord -----------------------------------------------------------

const validRecord = {
  id: "policy_abcd1234feedbabe",
  config: validConfig,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

describe("PolicyRecord", () => {
  it("accepts valid record", () => {
    const result = PolicyRecord.safeParse(validRecord);
    expect(result.success).toBe(true);
  });

  it("rejects invalid policy id prefix", () => {
    const result = PolicyRecord.safeParse({
      ...validRecord,
      id: "op_abcd1234feedbabe",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid datetime for createdAt", () => {
    const result = PolicyRecord.safeParse({
      ...validRecord,
      createdAt: "not-a-date",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid datetime for updatedAt", () => {
    const result = PolicyRecord.safeParse({
      ...validRecord,
      updatedAt: "not-a-date",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing config", () => {
    const result = PolicyRecord.safeParse({
      id: "policy_abcd1234feedbabe",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    });
    expect(result.success).toBe(false);
  });
});

// -- resolvePolicy ----------------------------------------------------------

describe("resolvePolicy", () => {
  it("returns policy scopes when no inline overrides given", () => {
    const result = resolvePolicy({
      label: "Base",
      allow: ["send", "react"],
      deny: ["leave"],
    });
    expect(result).toEqual({
      allow: ["send", "react"],
      deny: ["leave"],
    });
  });

  it("merges inline allow with policy allow", () => {
    const result = resolvePolicy({ label: "Base", allow: ["send"], deny: [] }, [
      "react",
      "reply",
    ]);
    expect(result.allow).toEqual(["send", "react", "reply"]);
  });

  it("merges inline deny with policy deny", () => {
    const result = resolvePolicy(
      { label: "Base", allow: [], deny: ["send"] },
      undefined,
      ["react"],
    );
    expect(result.deny).toEqual(["send", "react"]);
  });

  it("merges both inline allow and deny", () => {
    const result = resolvePolicy(
      { label: "Full", allow: ["send"], deny: ["leave"] },
      ["react"],
      ["join"],
    );
    expect(result).toEqual({
      allow: ["send", "react"],
      deny: ["leave", "join"],
    });
  });

  it("returns empty arrays when policy and inlines are empty", () => {
    const result = resolvePolicy({ label: "Empty", allow: [], deny: [] });
    expect(result).toEqual({ allow: [], deny: [] });
  });

  it("does not deduplicate scopes", () => {
    const result = resolvePolicy({ label: "Dupe", allow: ["send"], deny: [] }, [
      "send",
    ]);
    expect(result.allow).toEqual(["send", "send"]);
  });
});

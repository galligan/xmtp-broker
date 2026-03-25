import { describe, expect, it } from "bun:test";
import { z } from "zod";
import {
  ActionResultMetaSchema,
  ActionErrorSchema,
  PaginationSchema,
  ActionResultSchema,
  ActionErrorResultSchema,
} from "../result/action-result.js";

function validMeta() {
  return {
    requestId: "req-001",
    timestamp: "2026-01-15T12:00:00Z",
    durationMs: 42,
  };
}

describe("ActionResultMetaSchema", () => {
  it("accepts valid meta", () => {
    const result = ActionResultMetaSchema.safeParse(validMeta());
    expect(result.success).toBe(true);
  });

  it("rejects missing requestId", () => {
    const { requestId: _, ...rest } = validMeta();
    expect(ActionResultMetaSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects invalid timestamp", () => {
    expect(
      ActionResultMetaSchema.safeParse({
        ...validMeta(),
        timestamp: "not-a-date",
      }).success,
    ).toBe(false);
  });

  it("rejects negative durationMs", () => {
    expect(
      ActionResultMetaSchema.safeParse({
        ...validMeta(),
        durationMs: -1,
      }).success,
    ).toBe(false);
  });
});

describe("ActionErrorSchema", () => {
  it("accepts valid error", () => {
    const result = ActionErrorSchema.safeParse({
      _tag: "ValidationError",
      category: "validation",
      message: "Bad input",
      context: { field: "groupId" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts null context", () => {
    const result = ActionErrorSchema.safeParse({
      _tag: "InternalError",
      category: "internal",
      message: "Something broke",
      context: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid category", () => {
    const result = ActionErrorSchema.safeParse({
      _tag: "ValidationError",
      category: "bogus",
      message: "Bad",
      context: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing _tag", () => {
    const result = ActionErrorSchema.safeParse({
      category: "validation",
      message: "Bad",
      context: null,
    });
    expect(result.success).toBe(false);
  });
});

describe("PaginationSchema", () => {
  it("accepts valid pagination", () => {
    const result = PaginationSchema.safeParse({
      count: 10,
      hasMore: true,
      nextCursor: "cursor-abc",
      total: 42,
    });
    expect(result.success).toBe(true);
  });

  it("accepts minimal pagination without optional fields", () => {
    const result = PaginationSchema.safeParse({
      count: 0,
      hasMore: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative count", () => {
    const result = PaginationSchema.safeParse({
      count: -1,
      hasMore: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer count", () => {
    const result = PaginationSchema.safeParse({
      count: 1.5,
      hasMore: false,
    });
    expect(result.success).toBe(false);
  });
});

describe("ActionResultSchema (success factory)", () => {
  const TestDataSchema = z.object({ sessions: z.array(z.string()) });
  const TestResultSchema = ActionResultSchema(TestDataSchema);

  it("accepts valid success envelope", () => {
    const result = TestResultSchema.safeParse({
      ok: true,
      data: { sessions: ["s1", "s2"] },
      meta: validMeta(),
    });
    expect(result.success).toBe(true);
  });

  it("accepts success envelope with pagination", () => {
    const result = TestResultSchema.safeParse({
      ok: true,
      data: { sessions: ["s1"] },
      meta: validMeta(),
      pagination: { count: 1, hasMore: true, nextCursor: "c1" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects ok: false", () => {
    const result = TestResultSchema.safeParse({
      ok: false,
      data: { sessions: [] },
      meta: validMeta(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects data that does not match the schema", () => {
    const result = TestResultSchema.safeParse({
      ok: true,
      data: { wrong: "shape" },
      meta: validMeta(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing meta", () => {
    const result = TestResultSchema.safeParse({
      ok: true,
      data: { sessions: [] },
    });
    expect(result.success).toBe(false);
  });
});

describe("ActionErrorResultSchema", () => {
  it("accepts valid error envelope", () => {
    const result = ActionErrorResultSchema.safeParse({
      ok: false,
      error: {
        _tag: "NotFoundError",
        category: "not_found",
        message: "Credential not found",
        context: { credentialId: "cred_123" },
      },
      meta: validMeta(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects ok: true", () => {
    const result = ActionErrorResultSchema.safeParse({
      ok: true,
      error: {
        _tag: "NotFoundError",
        category: "not_found",
        message: "Not found",
        context: null,
      },
      meta: validMeta(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing error field", () => {
    const result = ActionErrorResultSchema.safeParse({
      ok: false,
      meta: validMeta(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing meta field", () => {
    const result = ActionErrorResultSchema.safeParse({
      ok: false,
      error: {
        _tag: "InternalError",
        category: "internal",
        message: "Oops",
        context: null,
      },
    });
    expect(result.success).toBe(false);
  });
});

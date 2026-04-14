import { describe, expect, test } from "bun:test";
import {
  AdminReadElevation,
  AdminReadElevationScope,
} from "../admin-read-elevation.js";

describe("admin read elevation schema", () => {
  test("accepts a scoped, time-bound elevation", () => {
    const parsed = AdminReadElevation.parse({
      approvalId: "approval_read_1",
      scope: {
        chatIds: ["conv_0123456789abcdef", "group-123"],
      },
      approvedAt: "2026-04-13T16:00:00.000Z",
      expiresAt: "2026-04-13T17:00:00.000Z",
      approvalKeyFingerprint: "local-approval-fingerprint",
    });

    expect(parsed.scope.chatIds).toEqual([
      "conv_0123456789abcdef",
      "group-123",
    ]);
  });

  test("rejects an elevation without scoped chats", () => {
    const result = AdminReadElevationScope.safeParse({
      chatIds: [],
    });

    expect(result.success).toBe(false);
  });

  test("rejects an elevation with a non-datetime expiry", () => {
    const result = AdminReadElevation.safeParse({
      approvalId: "approval_read_1",
      scope: {
        chatIds: ["conv_0123456789abcdef"],
      },
      approvedAt: "2026-04-13T16:00:00.000Z",
      expiresAt: "tomorrow-ish",
      approvalKeyFingerprint: "local-approval-fingerprint",
    });

    expect(result.success).toBe(false);
  });
});

import { describe, expect, test } from "bun:test";
import { Result } from "better-result";
import { PermissionError } from "@xmtp/signet-schemas";
import { createAdminReadElevationManager } from "../admin/read-elevation.js";
import { createAdminReadDisclosureStore } from "../admin/read-disclosure-store.js";

describe("createAdminReadElevationManager", () => {
  test("reuses a live elevation within the TTL window", async () => {
    let authorizeCalls = 0;
    let currentTime = new Date("2026-04-14T15:00:00.000Z");

    const manager = createAdminReadElevationManager({
      approver: {
        async authorize() {
          authorizeCalls += 1;
          return Result.ok(undefined);
        },
        async getApprovalFingerprint() {
          return Result.ok("approval-fingerprint");
        },
      },
      now: () => currentTime,
      ttlMs: 60_000,
    });

    const first = await manager.resolveForRequest({
      method: "message.list",
      params: {
        chatId: "conv_reuse",
        dangerouslyAllowMessageRead: true,
      },
      adminFingerprint: "admin-fingerprint",
      sessionKey: "admin-fingerprint:test-jti",
    });
    currentTime = new Date("2026-04-14T15:00:20.000Z");
    const second = await manager.resolveForRequest({
      method: "message.info",
      params: {
        chatId: "conv_reuse",
        messageId: "msg_2",
        dangerouslyAllowMessageRead: true,
      },
      adminFingerprint: "admin-fingerprint",
      sessionKey: "admin-fingerprint:test-jti",
    });

    expect(first.isOk()).toBe(true);
    expect(second.isOk()).toBe(true);
    if (first.isOk() && second.isOk()) {
      expect(first.value?.approvalId).toBe(second.value?.approvalId);
    }
    expect(authorizeCalls).toBe(1);
  });

  test("re-prompts after the cached elevation expires", async () => {
    let authorizeCalls = 0;
    let currentTime = new Date("2026-04-14T15:00:00.000Z");
    const auditActions: string[] = [];

    const manager = createAdminReadElevationManager({
      approver: {
        async authorize() {
          authorizeCalls += 1;
          return Result.ok(undefined);
        },
        async getApprovalFingerprint() {
          return Result.ok("approval-fingerprint");
        },
      },
      auditLog: {
        path: ":memory:",
        async append(entry) {
          auditActions.push(entry.action);
        },
        async tail() {
          return [];
        },
        async readAll() {
          return [];
        },
      },
      now: () => currentTime,
      ttlMs: 1_000,
    });

    const first = await manager.resolveForRequest({
      method: "message.list",
      params: {
        chatId: "conv_expire",
        dangerouslyAllowMessageRead: true,
      },
      adminFingerprint: "admin-fingerprint",
      sessionKey: "admin-fingerprint:test-jti",
    });
    currentTime = new Date("2026-04-14T15:00:02.000Z");
    const second = await manager.resolveForRequest({
      method: "message.list",
      params: {
        chatId: "conv_expire",
        dangerouslyAllowMessageRead: true,
      },
      adminFingerprint: "admin-fingerprint",
      sessionKey: "admin-fingerprint:test-jti",
    });

    expect(first.isOk()).toBe(true);
    expect(second.isOk()).toBe(true);
    if (first.isOk() && second.isOk()) {
      expect(first.value?.approvalId).not.toBe(second.value?.approvalId);
    }
    expect(authorizeCalls).toBe(2);
    expect(auditActions).toContain("admin.read-elevation.expired");
  });

  test("returns denial errors from the local approver", async () => {
    const manager = createAdminReadElevationManager({
      approver: {
        async authorize() {
          return Result.err(PermissionError.create("Elevation denied"));
        },
        async getApprovalFingerprint() {
          return Result.ok("approval-fingerprint");
        },
      },
    });

    const result = await manager.resolveForRequest({
      method: "message.list",
      params: {
        chatId: "conv_denied",
        dangerouslyAllowMessageRead: true,
      },
      adminFingerprint: "admin-fingerprint",
      sessionKey: "admin-fingerprint:test-jti",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.category).toBe("permission");
      expect(result.error.message).toContain("Elevation denied");
    }
  });

  test("updates public disclosure state when approval is granted and expires", async () => {
    let currentTime = new Date("2026-04-14T15:00:00.000Z");
    const disclosureStore = createAdminReadDisclosureStore({
      now: () => currentTime,
    });
    const changedChatBatches: string[][] = [];

    const manager = createAdminReadElevationManager({
      approver: {
        async authorize() {
          return Result.ok(undefined);
        },
        async getApprovalFingerprint() {
          return Result.ok("approval-fingerprint");
        },
      },
      disclosureStore,
      onDisclosureChanged: async (chatIds) => {
        changedChatBatches.push([...chatIds]);
        return Result.ok(undefined);
      },
      now: () => currentTime,
      ttlMs: 1_000,
    });

    const first = await manager.resolveForRequest({
      method: "message.list",
      params: {
        chatId: "conv_disclosed",
        dangerouslyAllowMessageRead: true,
      },
      adminFingerprint: "admin-fingerprint",
      sessionKey: "admin-fingerprint:test-jti",
    });

    expect(first.isOk()).toBe(true);
    expect(disclosureStore.get("conv_disclosed")).toEqual({
      operatorId: "owner",
      expiresAt: "2026-04-14T15:00:01.000Z",
    });

    currentTime = new Date("2026-04-14T15:00:02.000Z");
    const second = await manager.resolveForRequest({
      method: "message.list",
      params: {
        chatId: "conv_disclosed",
        dangerouslyAllowMessageRead: true,
      },
      adminFingerprint: "admin-fingerprint",
      sessionKey: "admin-fingerprint:test-jti",
    });

    expect(second.isOk()).toBe(true);
    expect(changedChatBatches).toEqual([
      ["conv_disclosed"],
      ["conv_disclosed"],
    ]);
    expect(disclosureStore.get("conv_disclosed")).toEqual({
      operatorId: "owner",
      expiresAt: "2026-04-14T15:00:03.000Z",
    });
  });
});

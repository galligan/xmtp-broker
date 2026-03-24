import { describe, test, expect } from "bun:test";
import { Result } from "better-result";
import type { SealEnvelopeType } from "@xmtp/signet-schemas";
import { NetworkError } from "@xmtp/signet-schemas";
import {
  republishToChats,
  type SealRepublisher,
  type AutoRepublishConfig,
} from "../auto-republish.js";

/** Minimal valid seal envelope for testing. */
function stubSeal(): SealEnvelopeType {
  return {
    chain: {
      current: {
        sealId: "seal_test0001",
        version: 1,
        credentialId: "cred_c001d00dfeedbabe",
        operatorId: "op_c001d00dfeedbabe",
        chatId: "chat_test0001",
        scopeMode: "per-chat",
        permissions: { allow: ["send"], deny: [] },
        issuedAt: new Date().toISOString(),
      },
      delta: { added: [], removed: [], changed: [] },
    },
    signature: "dGVzdA==",
    keyId: "key_feedc0defeedbabe",
    algorithm: "Ed25519",
  };
}

/** Creates a publisher that always succeeds and tracks calls. */
function succeedingPublisher(): SealRepublisher & {
  readonly calls: Array<{ chatId: string; seal: SealEnvelopeType }>;
} {
  const calls: Array<{ chatId: string; seal: SealEnvelopeType }> = [];
  const fn: SealRepublisher = async (chatId, seal) => {
    calls.push({ chatId, seal });
    return Result.ok();
  };
  return Object.assign(fn, { calls });
}

/** Creates a publisher that fails N times per chat, then succeeds. */
function failThenSucceedPublisher(
  failuresPerChat: Map<string, number>,
): SealRepublisher & {
  readonly callCounts: Map<string, number>;
} {
  const callCounts = new Map<string, number>();
  const fn: SealRepublisher = async (chatId, _seal) => {
    const count = (callCounts.get(chatId) ?? 0) + 1;
    callCounts.set(chatId, count);
    const maxFailures = failuresPerChat.get(chatId) ?? 0;
    if (count <= maxFailures) {
      return Result.err(
        NetworkError.create(chatId, `attempt ${String(count)} failed`),
      );
    }
    return Result.ok();
  };
  return Object.assign(fn, { callCounts });
}

/** Creates a publisher that always fails. */
function alwaysFailPublisher(): SealRepublisher & {
  readonly callCounts: Map<string, number>;
} {
  const callCounts = new Map<string, number>();
  const fn: SealRepublisher = async (chatId, _seal) => {
    const count = (callCounts.get(chatId) ?? 0) + 1;
    callCounts.set(chatId, count);
    return Result.err(
      NetworkError.create(chatId, `attempt ${String(count)} failed`),
    );
  };
  return Object.assign(fn, { callCounts });
}

describe("republishToChats", () => {
  test("all chats succeed on first attempt", async () => {
    const publisher = succeedingPublisher();
    const seal = stubSeal();
    const chatIds = ["chat_1", "chat_2", "chat_3"];

    const result = await republishToChats(chatIds, seal, publisher);

    expect(result.succeeded).toEqual(["chat_1", "chat_2", "chat_3"]);
    expect(result.failed).toEqual([]);
    expect(publisher.calls).toHaveLength(3);
  });

  test("retries a failing chat then succeeds", async () => {
    const failures = new Map([["chat_2", 2]]);
    const publisher = failThenSucceedPublisher(failures);
    const seal = stubSeal();
    const chatIds = ["chat_1", "chat_2"];

    const result = await republishToChats(chatIds, seal, publisher, {
      maxRetries: 3,
      initialDelayMs: 1,
    });

    expect(result.succeeded).toEqual(["chat_1", "chat_2"]);
    expect(result.failed).toEqual([]);
    // chat_2 should have been called 3 times (2 failures + 1 success)
    expect(publisher.callCounts.get("chat_2")).toBe(3);
  });

  test("chat fails all retries and appears in failed list", async () => {
    const publisher = alwaysFailPublisher();
    const seal = stubSeal();
    const chatIds = ["chat_1"];

    const result = await republishToChats(chatIds, seal, publisher, {
      maxRetries: 2,
      initialDelayMs: 1,
    });

    expect(result.succeeded).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.chatId).toBe("chat_1");
    expect(result.failed[0]?.error._tag).toBe("NetworkError");
    // 1 initial + 2 retries = 3 total calls
    expect(publisher.callCounts.get("chat_1")).toBe(3);
  });

  test("empty chatIds returns empty results", async () => {
    const publisher = succeedingPublisher();
    const seal = stubSeal();

    const result = await republishToChats([], seal, publisher);

    expect(result.succeeded).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(publisher.calls).toHaveLength(0);
  });

  test("custom config overrides defaults", async () => {
    const publisher = alwaysFailPublisher();
    const seal = stubSeal();
    const config: AutoRepublishConfig = {
      maxRetries: 1,
      initialDelayMs: 1,
    };

    const result = await republishToChats(["chat_1"], seal, publisher, config);

    // 1 initial + 1 retry = 2 total calls
    expect(publisher.callCounts.get("chat_1")).toBe(2);
    expect(result.failed).toHaveLength(1);
  });

  test("mixed results with multiple chats", async () => {
    const failures = new Map([["chat_fail", 999]]);
    const publisher = failThenSucceedPublisher(failures);
    const seal = stubSeal();

    const result = await republishToChats(
      ["chat_ok", "chat_fail"],
      seal,
      publisher,
      { maxRetries: 2, initialDelayMs: 1 },
    );

    expect(result.succeeded).toEqual(["chat_ok"]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.chatId).toBe("chat_fail");
  });
});

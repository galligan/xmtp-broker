import { describe, expect, test } from "bun:test";
import { Result } from "better-result";
import type { SessionRecord } from "@xmtp/signet-contracts";
import type { HarnessRequest, SignetEvent } from "@xmtp/signet-schemas";
import { createWsRequestHandler } from "../ws/request-handler.js";
import { createPendingActionStore } from "@xmtp/signet-sessions";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSessionRecord(
  overrides: Partial<SessionRecord> = {},
): SessionRecord {
  return {
    sessionId: "sess_action",
    agentInboxId: "agent_1",
    sessionKeyFingerprint: "fp_abc",
    view: {
      mode: "full",
      threadScopes: [{ groupId: "g1", threadId: null }],
      contentTypes: ["xmtp.org/text:1.0"],
    },
    grant: {
      messaging: { send: true, reply: false, react: false, draftOnly: true },
      groupManagement: {
        addMembers: false,
        removeMembers: false,
        updateMetadata: false,
        inviteUsers: false,
      },
      tools: { scopes: [] },
      egress: {
        storeExcerpts: false,
        useForMemory: false,
        forwardToProviders: false,
        quoteRevealed: false,
        summarize: false,
      },
    },
    state: "active",
    issuedAt: "2024-01-01T00:00:00Z",
    expiresAt: "2024-01-02T00:00:00Z",
    lastHeartbeat: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Integration: draftOnly session -> queue -> confirm/deny cycle
// ---------------------------------------------------------------------------

describe("action confirmation integration", () => {
  test("draftOnly session queues action and broadcasts confirmation event", async () => {
    const broadcastedEvents: { sessionId: string; event: SignetEvent }[] = [];
    const pendingActions = createPendingActionStore();

    const handler = createWsRequestHandler({
      ensureCoreReady: async () => Result.ok(undefined),
      sendMessage: async () => Result.ok({ messageId: "msg_1" }),
      sessionManager: {
        heartbeat: async () => Result.ok(undefined),
      },
      pendingActions,
      broadcast: (sessionId, event) => {
        broadcastedEvents.push({ sessionId, event });
      },
    });

    const session = makeSessionRecord();
    const request: HarnessRequest = {
      type: "send_message",
      requestId: "req_draft_1",
      groupId: "g1",
      contentType: "xmtp.org/text:1.0",
      content: { text: "draft message" },
    };

    const result = await handler(request, session);

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;

    const data = result.value as { pending: boolean; actionId: string };
    expect(data.pending).toBe(true);
    expect(typeof data.actionId).toBe("string");

    // Verify stored
    const stored = pendingActions.get(data.actionId);
    expect(stored).not.toBeNull();
    expect(stored?.actionType).toBe("send_message");

    // Verify broadcast
    expect(broadcastedEvents).toHaveLength(1);
    expect(broadcastedEvents[0]?.event.type).toBe(
      "action.confirmation_required",
    );
  });

  test("confirm executes the queued action", async () => {
    const sendCalls: string[] = [];
    const pendingActions = createPendingActionStore();

    const handler = createWsRequestHandler({
      ensureCoreReady: async () => Result.ok(undefined),
      sendMessage: async (groupId, contentType) => {
        sendCalls.push(`send:${groupId}:${contentType}`);
        return Result.ok({ messageId: "msg_confirmed" });
      },
      sessionManager: {
        heartbeat: async () => Result.ok(undefined),
      },
      pendingActions,
      broadcast: () => {},
    });

    // Pre-populate a pending action
    pendingActions.add({
      actionId: "act_e2e_confirm",
      sessionId: "sess_action",
      actionType: "send_message",
      payload: {
        groupId: "g1",
        contentType: "xmtp.org/text:1.0",
        content: { text: "hello" },
      },
      createdAt: "2024-01-01T00:00:00Z",
      expiresAt: "2099-01-01T00:05:00Z",
    });

    const request: HarnessRequest = {
      type: "confirm_action",
      requestId: "req_e2e_confirm",
      actionId: "act_e2e_confirm",
      confirmed: true,
    };

    const result = await handler(request, makeSessionRecord());

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ messageId: "msg_confirmed" });
    }
    expect(sendCalls).toEqual(["send:g1:xmtp.org/text:1.0"]);
    expect(pendingActions.get("act_e2e_confirm")).toBeNull();
  });

  test("deny discards the queued action without sending", async () => {
    const sendCalls: string[] = [];
    const pendingActions = createPendingActionStore();

    const handler = createWsRequestHandler({
      ensureCoreReady: async () => Result.ok(undefined),
      sendMessage: async () => {
        sendCalls.push("send");
        return Result.ok({ messageId: "unused" });
      },
      sessionManager: {
        heartbeat: async () => Result.ok(undefined),
      },
      pendingActions,
      broadcast: () => {},
    });

    pendingActions.add({
      actionId: "act_e2e_deny",
      sessionId: "sess_action",
      actionType: "send_message",
      payload: {
        groupId: "g1",
        contentType: "xmtp.org/text:1.0",
        content: { text: "nope" },
      },
      createdAt: "2024-01-01T00:00:00Z",
      expiresAt: "2099-01-01T00:05:00Z",
    });

    const request: HarnessRequest = {
      type: "confirm_action",
      requestId: "req_e2e_deny",
      actionId: "act_e2e_deny",
      confirmed: false,
    };

    const result = await handler(request, makeSessionRecord());

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        denied: true,
        actionId: "act_e2e_deny",
      });
    }
    expect(sendCalls).toEqual([]);
    expect(pendingActions.get("act_e2e_deny")).toBeNull();
  });
});

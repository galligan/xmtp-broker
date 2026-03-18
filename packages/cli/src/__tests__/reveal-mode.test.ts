import { describe, expect, test } from "bun:test";
import type { SessionRecord } from "@xmtp/signet-contracts";
import type { MessageEvent } from "@xmtp/signet-schemas";
import { createRevealStateStore } from "@xmtp/signet-policy";
import {
  createEventProjector,
  type EventProjectorDeps,
} from "../ws/event-projector.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSessionRecord(
  overrides: Partial<SessionRecord> = {},
): SessionRecord {
  return {
    sessionId: "sess_reveal",
    agentInboxId: "agent_1",
    sessionKeyFingerprint: "fp_abc",
    view: {
      mode: "full",
      threadScopes: [{ groupId: "g1", threadId: null }],
      contentTypes: ["xmtp.org/text:1.0"],
    },
    grant: {
      messaging: { send: true, reply: false, react: false, draftOnly: false },
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

function makeMessageEvent(overrides: Partial<MessageEvent> = {}): MessageEvent {
  return {
    type: "message.visible",
    messageId: "msg_1",
    groupId: "g1",
    senderInboxId: "sender_1",
    contentType: "xmtp.org/text:1.0",
    content: "Hello world",
    visibility: "visible",
    sentAt: "2024-01-01T00:00:00Z",
    sealId: null,
    threadId: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests -- integration of event projector + reveal state store
// ---------------------------------------------------------------------------

describe("reveal mode integration", () => {
  test("reveal-only mode drops unrevealed messages", () => {
    const store = createRevealStateStore();
    const deps: EventProjectorDeps = {
      getRevealState: () => store,
    };
    const projector = createEventProjector(deps);
    const session = makeSessionRecord({
      view: {
        mode: "reveal-only",
        threadScopes: [{ groupId: "g1", threadId: null }],
        contentTypes: ["xmtp.org/text:1.0"],
      },
    });
    const event = makeMessageEvent();

    const result = projector(event, session);

    expect(result).toBeNull();
  });

  test("reveal-only mode passes revealed messages", () => {
    const store = createRevealStateStore();
    // Grant a reveal for the sender
    store.grant(
      { revealId: "rev_1", sessionId: "sess_reveal", expiresAt: null },
      { groupId: "g1", scope: "sender", targetId: "sender_1" },
    );

    const deps: EventProjectorDeps = {
      getRevealState: () => store,
    };
    const projector = createEventProjector(deps);
    const session = makeSessionRecord({
      view: {
        mode: "reveal-only",
        threadScopes: [{ groupId: "g1", threadId: null }],
        contentTypes: ["xmtp.org/text:1.0"],
      },
    });
    const event = makeMessageEvent();

    const result = projector(event, session);

    expect(result).not.toBeNull();
    const msg = result as MessageEvent;
    expect(msg.visibility).toBe("revealed");
    expect(msg.content).toBe("Hello world");
  });

  test("redacted mode passes with null content when not revealed", () => {
    const store = createRevealStateStore();
    const deps: EventProjectorDeps = {
      getRevealState: () => store,
    };
    const projector = createEventProjector(deps);
    const session = makeSessionRecord({
      view: {
        mode: "redacted",
        threadScopes: [{ groupId: "g1", threadId: null }],
        contentTypes: ["xmtp.org/text:1.0"],
      },
    });
    const event = makeMessageEvent();

    const result = projector(event, session);

    expect(result).not.toBeNull();
    const msg = result as MessageEvent;
    expect(msg.visibility).toBe("redacted");
    expect(msg.content).toBeNull();
  });

  test("full mode passes events unchanged", () => {
    const deps: EventProjectorDeps = {
      getRevealState: () => null,
    };
    const projector = createEventProjector(deps);
    const session = makeSessionRecord({
      view: {
        mode: "full",
        threadScopes: [{ groupId: "g1", threadId: null }],
        contentTypes: ["xmtp.org/text:1.0"],
      },
    });
    const event = makeMessageEvent();

    const result = projector(event, session);

    expect(result).not.toBeNull();
    expect(result).toEqual(event);
  });

  test("reveal grant/revoke cycle: grant passes, new store drops", () => {
    // Phase 1: grant a reveal -> message passes
    const store1 = createRevealStateStore();
    store1.grant(
      { revealId: "rev_2", sessionId: "sess_reveal", expiresAt: null },
      { groupId: "g1", scope: "sender", targetId: "sender_1" },
    );

    const deps1: EventProjectorDeps = {
      getRevealState: () => store1,
    };
    const projector1 = createEventProjector(deps1);
    const session = makeSessionRecord({
      view: {
        mode: "reveal-only",
        threadScopes: [{ groupId: "g1", threadId: null }],
        contentTypes: ["xmtp.org/text:1.0"],
      },
    });
    const event = makeMessageEvent();

    const revealed = projector1(event, session);
    expect(revealed).not.toBeNull();
    expect((revealed as MessageEvent).visibility).toBe("revealed");

    // Phase 2: new store with no grants -> message is dropped
    const store2 = createRevealStateStore();
    const deps2: EventProjectorDeps = {
      getRevealState: () => store2,
    };
    const projector2 = createEventProjector(deps2);

    const dropped = projector2(event, session);
    expect(dropped).toBeNull();
  });
});

import { describe, expect, it } from "bun:test";
import {
  SendMessageRequest,
  SendReactionRequest,
  SendReplyRequest,
  UpdateViewRequest,
  RevealContentRequest,
  ConfirmActionRequest,
  HeartbeatRequest,
  HarnessRequest,
} from "../requests.js";

describe("SendMessageRequest", () => {
  it("accepts valid send message request", () => {
    const valid = {
      type: "send_message",
      requestId: "req-1",
      groupId: "group-1",
      contentType: "xmtp.org/text:1.0",
      content: { text: "hello" },
    };
    expect(SendMessageRequest.safeParse(valid).success).toBe(true);
  });

  it("rejects invalid content type", () => {
    const invalid = {
      type: "send_message",
      requestId: "req-1",
      groupId: "group-1",
      contentType: "invalid",
      content: {},
    };
    expect(SendMessageRequest.safeParse(invalid).success).toBe(false);
  });
});

describe("SendReactionRequest", () => {
  it("accepts valid reaction request", () => {
    const valid = {
      type: "send_reaction",
      requestId: "req-1",
      groupId: "group-1",
      messageId: "msg-1",
      action: "added",
      content: "thumbsup",
    };
    expect(SendReactionRequest.safeParse(valid).success).toBe(true);
  });

  it("rejects invalid action", () => {
    const invalid = {
      type: "send_reaction",
      requestId: "req-1",
      groupId: "group-1",
      messageId: "msg-1",
      action: "toggled",
      content: "thumbsup",
    };
    expect(SendReactionRequest.safeParse(invalid).success).toBe(false);
  });
});

describe("SendReplyRequest", () => {
  it("accepts valid reply request", () => {
    const valid = {
      type: "send_reply",
      requestId: "req-1",
      groupId: "group-1",
      messageId: "msg-1",
      contentType: "xmtp.org/text:1.0",
      content: { text: "reply" },
    };
    expect(SendReplyRequest.safeParse(valid).success).toBe(true);
  });
});

describe("UpdateViewRequest", () => {
  it("accepts valid update view request", () => {
    const valid = {
      type: "update_view",
      requestId: "req-1",
      view: {
        mode: "thread-only",
        threadScopes: [{ groupId: "g1", threadId: "t1" }],
        contentTypes: ["xmtp.org/text:1.0"],
      },
    };
    expect(UpdateViewRequest.safeParse(valid).success).toBe(true);
  });
});

describe("RevealContentRequest", () => {
  it("accepts valid reveal content request", () => {
    const valid = {
      type: "reveal_content",
      requestId: "req-1",
      reveal: {
        revealId: "rev-1",
        groupId: "group-1",
        scope: "message",
        targetId: "msg-123",
        requestedBy: "inbox-1",
        expiresAt: null,
      },
    };
    expect(RevealContentRequest.safeParse(valid).success).toBe(true);
  });
});

describe("ConfirmActionRequest", () => {
  it("accepts valid confirmation", () => {
    const valid = {
      type: "confirm_action",
      requestId: "req-1",
      actionId: "act-1",
      confirmed: true,
    };
    expect(ConfirmActionRequest.safeParse(valid).success).toBe(true);
  });

  it("accepts denial", () => {
    const valid = {
      type: "confirm_action",
      requestId: "req-1",
      actionId: "act-1",
      confirmed: false,
    };
    expect(ConfirmActionRequest.safeParse(valid).success).toBe(true);
  });
});

describe("HeartbeatRequest", () => {
  it("accepts valid heartbeat request", () => {
    const valid = {
      type: "heartbeat",
      requestId: "req-1",
      sessionId: "sess-1",
    };
    expect(HeartbeatRequest.safeParse(valid).success).toBe(true);
  });
});

describe("HarnessRequest discriminated union", () => {
  it("discriminates on type field", () => {
    const heartbeat = {
      type: "heartbeat",
      requestId: "req-1",
      sessionId: "sess-1",
    };
    const result = HarnessRequest.safeParse(heartbeat);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("heartbeat");
    }
  });

  it("rejects unknown request types", () => {
    expect(
      HarnessRequest.safeParse({ type: "unknown", requestId: "r1" }).success,
    ).toBe(false);
  });

  it("accepts all 7 request types", () => {
    const requests = [
      {
        type: "send_message",
        requestId: "r1",
        groupId: "g1",
        contentType: "xmtp.org/text:1.0",
        content: {},
      },
      {
        type: "send_reaction",
        requestId: "r2",
        groupId: "g1",
        messageId: "m1",
        action: "added",
        content: "ok",
      },
      {
        type: "send_reply",
        requestId: "r3",
        groupId: "g1",
        messageId: "m1",
        contentType: "xmtp.org/text:1.0",
        content: {},
      },
      {
        type: "update_view",
        requestId: "r4",
        view: {
          mode: "full",
          threadScopes: [{ groupId: "g1", threadId: null }],
          contentTypes: ["xmtp.org/text:1.0"],
        },
      },
      {
        type: "reveal_content",
        requestId: "r5",
        reveal: {
          revealId: "rev-1",
          groupId: "g1",
          scope: "message",
          targetId: "m1",
          requestedBy: "i1",
          expiresAt: null,
        },
      },
      {
        type: "confirm_action",
        requestId: "r6",
        actionId: "a1",
        confirmed: true,
      },
      { type: "heartbeat", requestId: "r7", sessionId: "s1" },
    ];

    for (const req of requests) {
      expect(HarnessRequest.safeParse(req).success).toBe(true);
    }
  });
});

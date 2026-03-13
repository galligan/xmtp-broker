import { describe, expect, it } from "bun:test";
import {
  SessionConfig,
  SessionToken,
  IssuedSession,
  SessionState,
} from "../session.js";

const validView = {
  mode: "full" as const,
  threadScopes: [{ groupId: "g1", threadId: null }],
  contentTypes: ["xmtp.org/text:1.0"],
};

const validGrant = {
  messaging: { send: true, reply: true, react: true, draftOnly: false },
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
};

describe("SessionConfig", () => {
  it("accepts valid config with defaults", () => {
    const result = SessionConfig.safeParse({
      agentInboxId: "agent-1",
      view: validView,
      grant: validGrant,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ttlSeconds).toBe(3600);
      expect(result.data.heartbeatInterval).toBe(30);
    }
  });

  it("accepts custom ttl and heartbeat", () => {
    const result = SessionConfig.safeParse({
      agentInboxId: "agent-1",
      view: validView,
      grant: validGrant,
      ttlSeconds: 7200,
      heartbeatInterval: 15,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ttlSeconds).toBe(7200);
      expect(result.data.heartbeatInterval).toBe(15);
    }
  });

  it("rejects non-positive ttlSeconds", () => {
    const result = SessionConfig.safeParse({
      agentInboxId: "agent-1",
      view: validView,
      grant: validGrant,
      ttlSeconds: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("SessionToken", () => {
  it("accepts valid session token", () => {
    const result = SessionToken.safeParse({
      sessionId: "sess-1",
      agentInboxId: "agent-1",
      sessionKeyFingerprint: "fp-abc",
      issuedAt: "2024-01-01T00:00:00Z",
      expiresAt: "2024-01-01T01:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid datetime", () => {
    const result = SessionToken.safeParse({
      sessionId: "sess-1",
      agentInboxId: "agent-1",
      sessionKeyFingerprint: "fp-abc",
      issuedAt: "not-a-date",
      expiresAt: "2024-01-01T01:00:00Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("SessionState", () => {
  it("accepts all valid states", () => {
    for (const s of [
      "active",
      "expired",
      "revoked",
      "reauthorization-required",
    ]) {
      expect(SessionState.safeParse(s).success).toBe(true);
    }
  });

  it("rejects invalid state", () => {
    expect(SessionState.safeParse("pending").success).toBe(false);
  });
});

describe("IssuedSession", () => {
  it("accepts valid issued session credentials", () => {
    const result = IssuedSession.safeParse({
      token: "bearer-token",
      session: {
        sessionId: "sess-1",
        agentInboxId: "agent-1",
        sessionKeyFingerprint: "fp-abc",
        issuedAt: "2024-01-01T00:00:00Z",
        expiresAt: "2024-01-01T01:00:00Z",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing bearer token", () => {
    const result = IssuedSession.safeParse({
      session: {
        sessionId: "sess-1",
        agentInboxId: "agent-1",
        sessionKeyFingerprint: "fp-abc",
        issuedAt: "2024-01-01T00:00:00Z",
        expiresAt: "2024-01-01T01:00:00Z",
      },
    });
    expect(result.success).toBe(false);
  });
});

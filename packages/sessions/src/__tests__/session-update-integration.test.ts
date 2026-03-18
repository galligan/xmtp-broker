import { beforeEach, describe, expect, test } from "bun:test";
import { Result } from "better-result";
import type { SessionManager } from "@xmtp/signet-contracts";
import { createSessionManager } from "../session-manager.js";
import { createSessionService } from "../service.js";
import { createUpdateActions } from "../update-actions.js";
import type { UpdateActionDeps } from "../update-actions.js";
import type { InternalSessionManager } from "../session-manager.js";
import { createTestSessionConfig, createTestView } from "./fixtures.js";

// ---------------------------------------------------------------------------
// Integration: session update with materiality enforcement
// ---------------------------------------------------------------------------

let manager: InternalSessionManager;
let sessionService: SessionManager;
let deps: UpdateActionDeps;
let sessionId: string;

beforeEach(async () => {
  manager = createSessionManager({
    defaultTtlSeconds: 60,
    maxConcurrentPerAgent: 3,
    renewalWindowSeconds: 10,
    heartbeatGracePeriod: 3,
  });

  sessionService = createSessionService({
    manager,
    keyManager: {
      async issueSessionKey(sid) {
        return Result.ok({ fingerprint: `fp_${sid}` });
      },
    },
  });

  deps = { sessionManager: sessionService, internalManager: manager };

  // Issue a session with mode: "full" and wide scope
  const config = createTestSessionConfig({
    view: {
      mode: "full",
      threadScopes: [
        { groupId: "group-1", threadId: null },
        { groupId: "group-2", threadId: null },
      ],
      contentTypes: ["text", "reaction"],
    },
  });
  const issued = await sessionService.issue(config);
  expect(issued.isOk()).toBe(true);
  if (!issued.isOk()) throw new Error("Failed to create session");

  const sessions = await sessionService.list();
  expect(sessions.isOk()).toBe(true);
  if (!sessions.isOk()) throw new Error("Failed to list sessions");
  const session = sessions.value[0];
  if (!session) throw new Error("No session found");
  sessionId = session.sessionId;
});

function stubContext() {
  return {
    requestId: "test-req",
    signal: new AbortController().signal,
  };
}

describe("session update integration", () => {
  test("non-material view narrowing applies immediately", async () => {
    const actions = createUpdateActions(deps);
    const updateView = actions.find((a) => a.id === "session.updateView");
    expect(updateView).toBeDefined();
    if (!updateView) return;

    // Narrow: remove group-2 from scope (same mode, fewer scopes)
    const narrowerView = createTestView({
      mode: "full",
      threadScopes: [{ groupId: "group-1", threadId: null }],
      contentTypes: ["text"],
    });

    const result = await updateView.handler(
      { sessionId, view: narrowerView },
      stubContext(),
    );
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;

    const output = result.value as {
      updated: boolean;
      material: boolean;
    };
    expect(output.updated).toBe(true);
    expect(output.material).toBe(false);

    // Verify the session was actually updated
    const lookupResult = await sessionService.lookup(sessionId);
    expect(lookupResult.isOk()).toBe(true);
    if (!lookupResult.isOk()) return;
    expect(lookupResult.value.view.threadScopes).toHaveLength(1);
  });

  test("material mode escalation triggers reauthorization", async () => {
    // First narrow mode so escalation is detectable
    const actions = createUpdateActions(deps);
    const updateView = actions.find((a) => a.id === "session.updateView");
    expect(updateView).toBeDefined();
    if (!updateView) return;

    // Narrow to redacted first
    const narrowed = createTestView({
      mode: "redacted",
      threadScopes: [{ groupId: "group-1", threadId: null }],
      contentTypes: ["text"],
    });
    const narrowResult = await updateView.handler(
      { sessionId, view: narrowed },
      stubContext(),
    );
    expect(narrowResult.isOk()).toBe(true);

    // Now escalate back to full -- this is material
    const escalated = createTestView({
      mode: "full",
      threadScopes: [{ groupId: "group-1", threadId: null }],
      contentTypes: ["text"],
    });
    const result = await updateView.handler(
      { sessionId, view: escalated },
      stubContext(),
    );
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;

    const output = result.value as {
      updated: boolean;
      material: boolean;
      reason: string | null;
    };
    expect(output.updated).toBe(false);
    expect(output.material).toBe(true);
    expect(output.reason).toBeTypeOf("string");

    // Session should now be in reauthorization-required state
    const internal = manager.getSessionById(sessionId);
    expect(internal.isOk()).toBe(true);
    if (!internal.isOk()) return;
    expect(internal.value.state).toBe("reauthorization-required");
  });
});

import { beforeEach, describe, expect, test } from "bun:test";
import { Result } from "better-result";
import type { SessionManager } from "@xmtp/signet-contracts";
import { createSessionManager } from "../session-manager.js";
import { createSessionService } from "../service.js";
import { createUpdateActions } from "../update-actions.js";
import type { UpdateActionDeps } from "../update-actions.js";
import {
  createTestSessionConfig,
  createTestView,
  createTestGrant,
  baseView,
  baseGrant,
} from "./fixtures.js";
import type { InternalSessionManager } from "../session-manager.js";

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

  // Create a session for tests
  const config = createTestSessionConfig();
  const issued = await sessionService.issue(config);
  expect(issued.isOk()).toBe(true);
  if (!issued.isOk()) throw new Error("Failed to create session");

  // Look up the sessionId
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

describe("session.updateView action", () => {
  test("applies non-material view change immediately", async () => {
    const actions = createUpdateActions(deps);
    const updateView = actions.find((a) => a.id === "session.updateView");
    expect(updateView).toBeDefined();
    if (!updateView) return;

    // Narrowing: full -> redacted is non-material (already at redacted, go to reveal-only)
    const narrowerView = createTestView({ mode: "reveal-only" });

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
    expect(lookupResult.value.view.mode).toBe("reveal-only");
  });

  test("triggers reauthorization for material view escalation", async () => {
    const actions = createUpdateActions(deps);
    const updateView = actions.find((a) => a.id === "session.updateView");
    expect(updateView).toBeDefined();
    if (!updateView) return;

    // Escalation: redacted -> full is material
    const escalatedView = createTestView({ mode: "full" });

    const result = await updateView.handler(
      { sessionId, view: escalatedView },
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

    // Verify the session state changed to reauthorization-required
    const internal = manager.getSessionById(sessionId);
    expect(internal.isOk()).toBe(true);
    if (!internal.isOk()) return;
    expect(internal.value.state).toBe("reauthorization-required");
  });

  test("returns NotFoundError for non-existent session", async () => {
    const actions = createUpdateActions(deps);
    const updateView = actions.find((a) => a.id === "session.updateView");
    expect(updateView).toBeDefined();
    if (!updateView) return;

    const result = await updateView.handler(
      { sessionId: "nonexistent", view: baseView },
      stubContext(),
    );
    expect(result.isOk()).toBe(false);
    if (result.isOk()) return;
    expect(result.error.category).toBe("not_found");
  });

  test("returns AuthError for expired session", async () => {
    const actions = createUpdateActions(deps);
    const updateView = actions.find((a) => a.id === "session.updateView");
    expect(updateView).toBeDefined();
    if (!updateView) return;

    // Revoke the session to make it inactive
    await sessionService.revoke(sessionId, "owner-initiated");

    const result = await updateView.handler(
      { sessionId, view: baseView },
      stubContext(),
    );
    expect(result.isOk()).toBe(false);
    if (result.isOk()) return;
    expect(result.error.category).toBe("auth");
  });
});

describe("session.updateGrant action", () => {
  test("applies non-material grant change immediately", async () => {
    const actions = createUpdateActions(deps);
    const updateGrant = actions.find((a) => a.id === "session.updateGrant");
    expect(updateGrant).toBeDefined();
    if (!updateGrant) return;

    // Narrowing: removing a tool scope is non-material
    // Base grant has no escalation fields true, so any false->false change is fine
    const narrowerGrant = createTestGrant();

    const result = await updateGrant.handler(
      { sessionId, grant: narrowerGrant },
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
  });

  test("triggers reauthorization for material grant escalation", async () => {
    const actions = createUpdateActions(deps);
    const updateGrant = actions.find((a) => a.id === "session.updateGrant");
    expect(updateGrant).toBeDefined();
    if (!updateGrant) return;

    // Escalation: send false -> true is material
    const escalatedGrant = createTestGrant({
      messaging: { send: true, reply: false, react: false, draftOnly: true },
    });

    const result = await updateGrant.handler(
      { sessionId, grant: escalatedGrant },
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

    // Verify the session state changed to reauthorization-required
    const internal = manager.getSessionById(sessionId);
    expect(internal.isOk()).toBe(true);
    if (!internal.isOk()) return;
    expect(internal.value.state).toBe("reauthorization-required");
  });

  test("returns NotFoundError for non-existent session", async () => {
    const actions = createUpdateActions(deps);
    const updateGrant = actions.find((a) => a.id === "session.updateGrant");
    expect(updateGrant).toBeDefined();
    if (!updateGrant) return;

    const result = await updateGrant.handler(
      { sessionId: "nonexistent", grant: baseGrant },
      stubContext(),
    );
    expect(result.isOk()).toBe(false);
    if (result.isOk()) return;
    expect(result.error.category).toBe("not_found");
  });

  test("returns AuthError for revoked session", async () => {
    const actions = createUpdateActions(deps);
    const updateGrant = actions.find((a) => a.id === "session.updateGrant");
    expect(updateGrant).toBeDefined();
    if (!updateGrant) return;

    await sessionService.revoke(sessionId, "owner-initiated");

    const result = await updateGrant.handler(
      { sessionId, grant: baseGrant },
      stubContext(),
    );
    expect(result.isOk()).toBe(false);
    if (result.isOk()) return;
    expect(result.error.category).toBe("auth");
  });
});

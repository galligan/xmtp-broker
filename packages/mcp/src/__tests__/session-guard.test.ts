import { describe, test, expect } from "bun:test";
import { validateSession, checkSessionLiveness } from "../session-guard.js";
import { makeSessionRecord, createMockSessionManager } from "./fixtures.js";

describe("validateSession", () => {
  test("valid token resolves to session record", async () => {
    const record = makeSessionRecord();
    const manager = createMockSessionManager("valid_token", record);

    const result = await validateSession("valid_token", manager);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.sessionId).toBe("sess_test");
    }
  });

  test("invalid token returns auth error", async () => {
    const manager = createMockSessionManager("valid_token");

    const result = await validateSession("bad_token", manager);

    expect(result.isOk()).toBe(false);
    if (!result.isOk()) {
      expect(result.error.category).toBe("auth");
    }
  });
});

describe("checkSessionLiveness", () => {
  test("active non-expired session passes", async () => {
    const record = makeSessionRecord({
      expiresAt: "2099-01-01T00:00:00Z",
      state: "active",
    });
    const manager = createMockSessionManager("valid_token", record);

    const result = await checkSessionLiveness(record, manager);

    expect(result.isOk()).toBe(true);
  });

  test("expired session returns auth error", async () => {
    const record = makeSessionRecord({
      expiresAt: "2020-01-01T00:00:00Z",
      state: "active",
    });
    const manager = createMockSessionManager("valid_token", record);

    const result = await checkSessionLiveness(record, manager);

    expect(result.isOk()).toBe(false);
    if (!result.isOk()) {
      expect(result.error.category).toBe("auth");
    }
  });

  test("revoked session returns auth error", async () => {
    const record = makeSessionRecord({
      expiresAt: "2099-01-01T00:00:00Z",
      state: "revoked",
    });
    const manager = createMockSessionManager("valid_token", record);
    // Update the session in the manager state to be inactive
    manager._state.sessions.set(record.sessionId, record);

    const result = await checkSessionLiveness(record, manager);

    expect(result.isOk()).toBe(false);
    if (!result.isOk()) {
      expect(result.error.category).toBe("auth");
    }
  });

  test("session check uses mock session manager", async () => {
    const record = makeSessionRecord();
    const manager = createMockSessionManager("valid_token", record);

    const result = await checkSessionLiveness(record, manager);

    expect(result.isOk()).toBe(true);
  });
});

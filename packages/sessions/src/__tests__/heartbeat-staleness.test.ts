import { describe, test, expect, beforeEach } from "bun:test";
import { createSessionManager } from "../session-manager.js";
import type { InternalSessionManager } from "../session-manager.js";
import { createTestSessionConfig } from "./fixtures.js";

let manager: InternalSessionManager;

beforeEach(() => {
  manager = createSessionManager({
    heartbeatGracePeriod: 2,
  });
});

describe("isHeartbeatStale", () => {
  test("returns false for freshly created session", async () => {
    const created = await manager.createSession(
      createTestSessionConfig({ heartbeatInterval: 5 }),
      "fp_1",
    );
    expect(created.isOk()).toBe(true);
    if (!created.isOk()) return;

    const result = manager.isHeartbeatStale(created.value.sessionId);
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toBe(false);
  });

  test("returns true when heartbeat exceeds interval + grace period", async () => {
    const created = await manager.createSession(
      createTestSessionConfig({ heartbeatInterval: 0.1 }),
      "fp_1",
    );
    expect(created.isOk()).toBe(true);
    if (!created.isOk()) return;

    // Wait for heartbeat interval + grace period to elapse
    await new Promise((resolve) => setTimeout(resolve, 2200));

    const result = manager.isHeartbeatStale(created.value.sessionId);
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toBe(true);
  });

  test("returns false after recording a fresh heartbeat", async () => {
    const created = await manager.createSession(
      createTestSessionConfig({ heartbeatInterval: 0.1 }),
      "fp_1",
    );
    expect(created.isOk()).toBe(true);
    if (!created.isOk()) return;

    // Wait a bit, then record heartbeat
    await new Promise((resolve) => setTimeout(resolve, 500));
    manager.recordHeartbeat(created.value.sessionId);

    const result = manager.isHeartbeatStale(created.value.sessionId);
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toBe(false);
  });

  test("returns NotFoundError for unknown session", () => {
    const result = manager.isHeartbeatStale("unknown");
    expect(result.isErr()).toBe(true);
  });
});

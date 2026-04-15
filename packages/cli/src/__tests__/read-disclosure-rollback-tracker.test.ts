import { describe, expect, test } from "bun:test";
import { createReadDisclosureRollbackTracker } from "../admin/read-disclosure-rollback-tracker.js";

describe("createReadDisclosureRollbackTracker", () => {
  test("keeps a chat active until all overlapping rollback windows exit", () => {
    const tracker = createReadDisclosureRollbackTracker();

    tracker.enter(["conv_overlap"]);
    tracker.enter(["conv_overlap"]);
    expect(tracker.has("conv_overlap")).toBe(true);

    tracker.leave(["conv_overlap"]);
    expect(tracker.has("conv_overlap")).toBe(true);

    tracker.leave(["conv_overlap"]);
    expect(tracker.has("conv_overlap")).toBe(false);
  });

  test("de-dupes repeated chat ids inside a single enter or leave call", () => {
    const tracker = createReadDisclosureRollbackTracker();

    tracker.enter(["conv_dup", "conv_dup"]);
    expect(tracker.has("conv_dup")).toBe(true);

    tracker.leave(["conv_dup", "conv_dup"]);
    expect(tracker.has("conv_dup")).toBe(false);
  });
});

import { describe, expect, it } from "bun:test";
import {
  ViewMode,
  ContentTypeAllowlist,
  ThreadScope,
  ViewConfig,
} from "../view.js";

describe("ViewMode", () => {
  it("accepts all valid view modes", () => {
    for (const mode of [
      "full",
      "thread-only",
      "redacted",
      "reveal-only",
      "summary-only",
    ]) {
      expect(ViewMode.safeParse(mode).success).toBe(true);
    }
  });

  it("rejects invalid view mode", () => {
    expect(ViewMode.safeParse("invalid").success).toBe(false);
  });
});

describe("ContentTypeAllowlist", () => {
  it("accepts array with at least one valid content type", () => {
    expect(ContentTypeAllowlist.safeParse(["xmtp.org/text:1.0"]).success).toBe(
      true,
    );
  });

  it("rejects empty array", () => {
    expect(ContentTypeAllowlist.safeParse([]).success).toBe(false);
  });

  it("rejects array with invalid content type", () => {
    expect(ContentTypeAllowlist.safeParse(["invalid"]).success).toBe(false);
  });
});

describe("ThreadScope", () => {
  it("accepts scope with group and thread", () => {
    const result = ThreadScope.safeParse({
      groupId: "group-1",
      threadId: "thread-1",
    });
    expect(result.success).toBe(true);
  });

  it("accepts scope with null threadId for entire group", () => {
    const result = ThreadScope.safeParse({
      groupId: "group-1",
      threadId: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing threadId (must be explicit null)", () => {
    const result = ThreadScope.safeParse({ groupId: "group-1" });
    expect(result.success).toBe(false);
  });
});

describe("ViewConfig", () => {
  const validConfig = {
    mode: "full",
    threadScopes: [{ groupId: "group-1", threadId: null }],
    contentTypes: ["xmtp.org/text:1.0"],
  };

  it("accepts valid view config", () => {
    expect(ViewConfig.safeParse(validConfig).success).toBe(true);
  });

  it("rejects empty threadScopes", () => {
    expect(
      ViewConfig.safeParse({ ...validConfig, threadScopes: [] }).success,
    ).toBe(false);
  });

  it("rejects empty contentTypes", () => {
    expect(
      ViewConfig.safeParse({ ...validConfig, contentTypes: [] }).success,
    ).toBe(false);
  });

  it("rejects invalid mode", () => {
    expect(ViewConfig.safeParse({ ...validConfig, mode: "bad" }).success).toBe(
      false,
    );
  });
});

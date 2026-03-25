import { describe, test, expect } from "bun:test";
import {
  validateSendMessage,
  validateSendReply,
} from "../permissions/validate-send.js";
import { Result } from "better-result";
import {
  createFullScopes,
  createEmptyScopes,
  createChatIds,
} from "./fixtures.js";
import type { GrantConfig, ViewConfig } from "@xmtp/signet-schemas";

const fullGrant: GrantConfig = {
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

const chatView: ViewConfig = {
  mode: "full",
  threadScopes: [{ groupId: "group-1", threadId: null }],
  contentTypes: ["xmtp.org/text:1.0"],
};

describe("validateSendMessage", () => {
  test("succeeds when send scope is allowed and chat is in scope", () => {
    const result = validateSendMessage(
      { groupId: "group-1" },
      createFullScopes(),
      createChatIds("group-1"),
    );
    expect(Result.isOk(result)).toBe(true);
  });

  test("returns PermissionError when send scope is denied", () => {
    const result = validateSendMessage(
      { groupId: "group-1" },
      createEmptyScopes(),
      createChatIds("group-1"),
    );
    expect(Result.isError(result)).toBe(true);
    if (Result.isError(result)) {
      expect(result.error._tag).toBe("PermissionError");
    }
  });

  test("returns PermissionError when chat is not in scope", () => {
    const result = validateSendMessage(
      { groupId: "group-other" },
      createFullScopes(),
      createChatIds("group-1"),
    );
    expect(Result.isError(result)).toBe(true);
    if (Result.isError(result)) {
      expect(result.error._tag).toBe("PermissionError");
    }
  });

  test("returns PermissionError for empty chatIds", () => {
    const result = validateSendMessage(
      { groupId: "group-1" },
      createFullScopes(),
      createChatIds(),
    );
    expect(Result.isError(result)).toBe(true);
  });

  test("preserves draftOnly for legacy grant/view callers", () => {
    const result = validateSendMessage(
      { groupId: "group-1" },
      {
        ...fullGrant,
        messaging: { ...fullGrant.messaging, draftOnly: true },
      },
      chatView,
    );

    expect(Result.isOk(result)).toBe(true);
    if (Result.isOk(result)) {
      expect(result.value.draftOnly).toBe(true);
    }
  });
});

describe("validateSendReply", () => {
  test("succeeds when reply scope is allowed and chat is in scope", () => {
    const result = validateSendReply(
      { groupId: "group-1" },
      createFullScopes(),
      createChatIds("group-1"),
    );
    expect(Result.isOk(result)).toBe(true);
  });

  test("returns PermissionError when reply scope is denied", () => {
    const result = validateSendReply(
      { groupId: "group-1" },
      createEmptyScopes(),
      createChatIds("group-1"),
    );
    expect(Result.isError(result)).toBe(true);
    if (Result.isError(result)) {
      expect(result.error._tag).toBe("PermissionError");
    }
  });

  test("returns PermissionError when chat is not in scope", () => {
    const result = validateSendReply(
      { groupId: "group-other" },
      createFullScopes(),
      createChatIds("group-1"),
    );
    expect(Result.isError(result)).toBe(true);
  });
});

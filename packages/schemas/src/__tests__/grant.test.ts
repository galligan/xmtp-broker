import { describe, expect, it } from "bun:test";
import {
  MessagingGrant,
  GroupManagementGrant,
  ToolScope,
  ToolGrant,
  EgressGrant,
  GrantConfig,
} from "../grant.js";

describe("MessagingGrant", () => {
  it("accepts valid messaging grant", () => {
    const valid = { send: true, reply: true, react: false, draftOnly: false };
    expect(MessagingGrant.safeParse(valid).success).toBe(true);
  });

  it("rejects missing fields", () => {
    expect(MessagingGrant.safeParse({ send: true }).success).toBe(false);
  });

  it("rejects non-boolean values", () => {
    const invalid = {
      send: "yes",
      reply: true,
      react: false,
      draftOnly: false,
    };
    expect(MessagingGrant.safeParse(invalid).success).toBe(false);
  });
});

describe("GroupManagementGrant", () => {
  it("accepts valid group management grant", () => {
    const valid = {
      addMembers: true,
      removeMembers: false,
      updateMetadata: true,
      inviteUsers: false,
    };
    expect(GroupManagementGrant.safeParse(valid).success).toBe(true);
  });
});

describe("ToolScope", () => {
  it("accepts scope with null parameters", () => {
    const valid = { toolId: "tool-1", allowed: true, parameters: null };
    expect(ToolScope.safeParse(valid).success).toBe(true);
  });

  it("accepts scope with parameter constraints", () => {
    const valid = {
      toolId: "tool-1",
      allowed: true,
      parameters: { maxTokens: 100 },
    };
    expect(ToolScope.safeParse(valid).success).toBe(true);
  });

  it("rejects undefined parameters (must be explicit null)", () => {
    const invalid = { toolId: "tool-1", allowed: true };
    expect(ToolScope.safeParse(invalid).success).toBe(false);
  });
});

describe("ToolGrant", () => {
  it("accepts grant with empty scopes", () => {
    expect(ToolGrant.safeParse({ scopes: [] }).success).toBe(true);
  });

  it("accepts grant with multiple scopes", () => {
    const valid = {
      scopes: [
        { toolId: "a", allowed: true, parameters: null },
        { toolId: "b", allowed: false, parameters: { limit: 5 } },
      ],
    };
    expect(ToolGrant.safeParse(valid).success).toBe(true);
  });
});

describe("EgressGrant", () => {
  it("accepts valid egress grant", () => {
    const valid = {
      storeExcerpts: false,
      useForMemory: false,
      forwardToProviders: true,
      quoteRevealed: false,
      summarize: true,
    };
    expect(EgressGrant.safeParse(valid).success).toBe(true);
  });
});

describe("GrantConfig", () => {
  const validConfig = {
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

  it("accepts valid full grant config", () => {
    expect(GrantConfig.safeParse(validConfig).success).toBe(true);
  });

  it("rejects missing sections", () => {
    const { messaging: _, ...rest } = validConfig;
    expect(GrantConfig.safeParse(rest).success).toBe(false);
  });
});

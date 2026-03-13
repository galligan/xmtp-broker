import { z } from "zod";

export type MessagingGrant = {
  send: boolean;
  reply: boolean;
  react: boolean;
  draftOnly: boolean;
};

export const MessagingGrant: z.ZodType<MessagingGrant> = z
  .object({
    send: z.boolean().describe("Can send messages"),
    reply: z.boolean().describe("Can reply in threads"),
    react: z.boolean().describe("Can add/remove reactions"),
    draftOnly: z
      .boolean()
      .describe("Messages require owner confirmation before sending"),
  })
  .describe("Messaging action permissions");

export type GroupManagementGrant = {
  addMembers: boolean;
  removeMembers: boolean;
  updateMetadata: boolean;
  inviteUsers: boolean;
};

export const GroupManagementGrant: z.ZodType<GroupManagementGrant> = z
  .object({
    addMembers: z.boolean().describe("Can add members to the group"),
    removeMembers: z.boolean().describe("Can remove members from the group"),
    updateMetadata: z.boolean().describe("Can update group metadata"),
    inviteUsers: z.boolean().describe("Can issue invitations"),
  })
  .describe("Group management permissions");

export type ToolScope = {
  toolId: string;
  allowed: boolean;
  parameters: Record<string, unknown> | null;
};

export const ToolScope: z.ZodType<ToolScope> = z
  .object({
    toolId: z.string().describe("Identifier for the tool"),
    allowed: z.boolean().describe("Whether this tool is currently allowed"),
    parameters: z
      .record(z.string(), z.unknown())
      .nullable()
      .describe("Permitted parameter constraints, null for unconstrained"),
  })
  .describe("Permission scope for a single tool");

export type ToolGrant = {
  scopes: ToolScope[];
};

export const ToolGrant: z.ZodType<ToolGrant> = z
  .object({
    scopes: z.array(ToolScope).describe("Per-tool permission scopes"),
  })
  .describe("Tool capability permissions");

export type EgressGrant = {
  storeExcerpts: boolean;
  useForMemory: boolean;
  forwardToProviders: boolean;
  quoteRevealed: boolean;
  summarize: boolean;
};

export const EgressGrant: z.ZodType<EgressGrant> = z
  .object({
    storeExcerpts: z.boolean().describe("Can store message excerpts"),
    useForMemory: z.boolean().describe("Can use content for persistent memory"),
    forwardToProviders: z
      .boolean()
      .describe("Can forward content to inference providers"),
    quoteRevealed: z
      .boolean()
      .describe("Can quote revealed content in messages"),
    summarize: z.boolean().describe("Can summarize hidden or revealed content"),
  })
  .describe("Retention and egress permissions");

export type GrantConfig = {
  messaging: MessagingGrant;
  groupManagement: GroupManagementGrant;
  tools: ToolGrant;
  egress: EgressGrant;
};

export const GrantConfig: z.ZodType<GrantConfig> = z
  .object({
    messaging: MessagingGrant.describe("Messaging action permissions"),
    groupManagement: GroupManagementGrant.describe(
      "Group management permissions",
    ),
    tools: ToolGrant.describe("Tool capability permissions"),
    egress: EgressGrant.describe("Retention and egress permissions"),
  })
  .describe("Complete grant configuration for an agent session");

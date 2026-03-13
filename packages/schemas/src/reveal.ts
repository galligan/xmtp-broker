import { z } from "zod";

export const RevealScope: z.ZodEnum<
  ["message", "thread", "time-window", "content-type", "sender"]
> = z
  .enum(["message", "thread", "time-window", "content-type", "sender"])
  .describe("Granularity of a reveal operation");

export type RevealScope = z.infer<typeof RevealScope>;

export type RevealRequest = {
  revealId: string;
  groupId: string;
  scope: RevealScope;
  targetId: string;
  requestedBy: string;
  expiresAt: string | null;
};

export const RevealRequest: z.ZodType<RevealRequest> = z
  .object({
    revealId: z.string().describe("Unique reveal request identifier"),
    groupId: z.string().describe("Group containing the content"),
    scope: RevealScope.describe("What granularity to reveal"),
    targetId: z
      .string()
      .describe("ID of the message, thread, content type, or sender"),
    requestedBy: z
      .string()
      .describe("Inbox ID of the member requesting the reveal"),
    expiresAt: z
      .string()
      .datetime()
      .nullable()
      .describe("When this reveal expires, null for permanent"),
  })
  .describe("Request to reveal content to an agent");

export type RevealGrant = {
  revealId: string;
  grantedAt: string;
  grantedBy: string;
  expiresAt: string | null;
};

export const RevealGrant: z.ZodType<RevealGrant> = z
  .object({
    revealId: z.string().describe("Matches the RevealRequest.revealId"),
    grantedAt: z.string().datetime().describe("When the reveal was granted"),
    grantedBy: z.string().describe("Inbox ID of the granting member"),
    expiresAt: z
      .string()
      .datetime()
      .nullable()
      .describe("When this grant expires, null for permanent"),
  })
  .describe("Granted reveal making content visible to the agent");

export type RevealState = {
  activeReveals: RevealGrant[];
};

export const RevealState: z.ZodType<RevealState> = z
  .object({
    activeReveals: z
      .array(RevealGrant)
      .describe("Currently active reveal grants"),
  })
  .describe("Aggregate reveal state for a session");

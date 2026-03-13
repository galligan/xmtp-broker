import { z } from "zod";
import { ContentTypeId } from "./content-types.js";

export const ViewMode: z.ZodEnum<
  ["full", "thread-only", "redacted", "reveal-only", "summary-only"]
> = z
  .enum(["full", "thread-only", "redacted", "reveal-only", "summary-only"])
  .describe("Visibility mode for the agent's view of conversations");

export type ViewMode = z.infer<typeof ViewMode>;

export type ContentTypeAllowlist = string[];

export const ContentTypeAllowlist: z.ZodType<ContentTypeAllowlist> = z
  .array(ContentTypeId)
  .min(1)
  .describe("Content types the agent is allowed to see");

export type ThreadScope = {
  groupId: string;
  threadId: string | null;
};

export const ThreadScope: z.ZodType<ThreadScope> = z
  .object({
    groupId: z.string().describe("Group the thread belongs to"),
    threadId: z
      .string()
      .nullable()
      .describe("Specific thread ID, or null for entire group"),
  })
  .describe("Scopes a view to a specific group and optional thread");

export type ViewConfig = {
  mode: ViewMode;
  threadScopes: ThreadScope[];
  contentTypes: ContentTypeAllowlist;
};

export const ViewConfig: z.ZodType<ViewConfig> = z
  .object({
    mode: ViewMode.describe("Base visibility mode"),
    threadScopes: z
      .array(ThreadScope)
      .min(1)
      .describe("Groups and threads this view covers"),
    contentTypes: ContentTypeAllowlist.describe(
      "Allowed content types for this view",
    ),
  })
  .describe("Complete view configuration for an agent session");

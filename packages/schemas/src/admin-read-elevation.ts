import { z } from "zod";

/** Scoped target set for owner-approved admin message access. */
export type AdminReadElevationScopeType = {
  chatIds: string[];
};

/** Explicit, time-bound admin message-read elevation. */
export type AdminReadElevationType = {
  approvalId: string;
  scope: AdminReadElevationScopeType;
  approvedAt: string;
  expiresAt: string;
  approvalKeyFingerprint: string;
};

/**
 * Scope carried by an owner-approved admin read elevation.
 *
 * Chat IDs may be local `conv_` identifiers or raw XMTP group IDs; handlers
 * resolve them through the normal mapping layer before enforcement.
 */
export const AdminReadElevationScope: z.ZodType<AdminReadElevationScopeType> = z
  .object({
    chatIds: z
      .array(z.string())
      .min(1)
      .describe("Conversations covered by the temporary read elevation"),
  })
  .describe("Scoped target set for owner-approved admin message access");

/** Owner-approved, time-bound admin read elevation. */
export const AdminReadElevation: z.ZodType<AdminReadElevationType> = z
  .object({
    approvalId: z
      .string()
      .min(1)
      .describe("Audit identifier for the owner-approved elevation"),
    scope: AdminReadElevationScope,
    approvedAt: z
      .string()
      .datetime()
      .describe("When the owner approved the elevation"),
    expiresAt: z
      .string()
      .datetime()
      .describe("When the elevation expires automatically"),
    approvalKeyFingerprint: z
      .string()
      .min(1)
      .describe("Fingerprint of the local approval key used for the elevation"),
  })
  .describe("Explicit, time-bound admin message-read elevation");

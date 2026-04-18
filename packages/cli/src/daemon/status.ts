import type { CoreState } from "@xmtp/signet-contracts";
import { z } from "zod";

/** Daemon status as returned by `status` and admin `ping()`. */
export type DaemonStatus = {
  /** High-level daemon process lifecycle state. */
  state: "running" | "draining" | "stopped";
  /** Current XMTP core readiness state projected into the public contract. */
  coreState: CoreState;
  pid: number;
  uptime: number;
  /** Count of credentials that are currently issued and not revoked. */
  activeCredentials: number;
  /** Number of live harness/admin transport connections. */
  activeConnections: number;
  /** Active onboarding flow family used for invite/profile orchestration. */
  onboardingScheme: "convos";
  /** XMTP environment the daemon is currently connected to. */
  xmtpEnv: "local" | "dev" | "production";
  /** Identity isolation posture chosen for this runtime. */
  identityMode: "per-group" | "shared";
  wsPort: number;
  version: string;
  /** Number of local identities currently registered in the runtime store. */
  identityCount: number;
  /** Whether the core has reached a live network-connected state. */
  networkState: "disconnected" | "connected";
  /** Inbox IDs that the current runtime has actively connected for syncing. */
  connectedInboxIds: readonly string[];
};

/**
 * Daemon status response schema.
 * Returned by the `status` command and admin `ping()`.
 */
export const DaemonStatusSchema: z.ZodType<DaemonStatus> = z
  .object({
    state: z
      .enum(["running", "draining", "stopped"])
      .describe("Current daemon state"),
    coreState: z
      .enum([
        "uninitialized",
        "initializing",
        "ready-local",
        "ready",
        "shutting-down",
        "stopped",
        "error",
      ])
      .describe("Current signet core state"),
    pid: z.number().int().positive().describe("Daemon process ID"),
    uptime: z.number().nonnegative().describe("Uptime in seconds"),
    activeCredentials: z
      .number()
      .int()
      .nonnegative()
      .describe("Number of active credentials"),
    activeConnections: z
      .number()
      .int()
      .nonnegative()
      .describe("Number of active WebSocket connections"),
    onboardingScheme: z
      .enum(["convos"])
      .describe("Configured onboarding scheme"),
    xmtpEnv: z
      .enum(["local", "dev", "production"])
      .describe("XMTP network environment"),
    identityMode: z
      .enum(["per-group", "shared"])
      .describe("Identity isolation strategy"),
    wsPort: z.number().int().nonnegative().describe("WebSocket server port"),
    version: z.string().describe("Signet version string"),
    identityCount: z
      .number()
      .int()
      .nonnegative()
      .describe("Number of registered identities"),
    networkState: z
      .enum(["disconnected", "connected"])
      .describe("Whether the signet core has reached the network"),
    connectedInboxIds: z
      .array(z.string())
      .describe("List of connected XMTP inbox IDs"),
  })
  .describe("Daemon status response");

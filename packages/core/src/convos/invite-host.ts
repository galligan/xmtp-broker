import { Result } from "better-result";
import type { SignetError } from "@xmtp/signet-schemas";
import type { CoreRawEvent, RawMessageEvent } from "../raw-events.js";
import {
  processJoinRequest,
  type ProcessJoinRequestDeps,
  type IncomingJoinMessage,
  type JoinRequestResult,
} from "./process-join-requests.js";

/** Dependencies for the invite host listener. */
export interface InviteHostDeps {
  /** The secp256k1 private key (hex, no 0x prefix) for the host identity. */
  readonly walletPrivateKeyHex: string;
  /** The host's inbox ID. */
  readonly creatorInboxId: string;
  /** Add members to a group. */
  readonly addMembersToGroup: (
    groupId: string,
    inboxIds: readonly string[],
  ) => Promise<Result<void, SignetError>>;
  /** Look up the stored invite tag for a group. */
  readonly getGroupInviteTag: (
    groupId: string,
  ) => Promise<Result<string | undefined, SignetError>>;
}

/**
 * Try to process a raw message event as an invite join request.
 *
 * Returns the join result if the message was a valid invite URL,
 * or `null` if the message is not a join request (so the caller
 * can ignore it).
 */
export async function tryProcessJoinRequest(
  deps: InviteHostDeps,
  event: RawMessageEvent,
): Promise<Result<JoinRequestResult, SignetError> | null> {
  // Only process text content
  if (typeof event.content !== "string") return null;

  // Quick heuristic: invite slugs/URLs are always long single-token strings.
  // Short messages or multi-word text are clearly not invites.
  const text = event.content.trim();
  if (text.length < 50 || text.includes(" ")) return null;

  const message: IncomingJoinMessage = {
    senderInboxId: event.senderInboxId,
    messageText: text,
  };

  return processJoinRequest(
    {
      walletPrivateKeyHex: deps.walletPrivateKeyHex,
      creatorInboxId: deps.creatorInboxId,
      addMembersToGroup: deps.addMembersToGroup,
      getGroupInviteTag: deps.getGroupInviteTag,
    } satisfies ProcessJoinRequestDeps,
    message,
  );
}

/**
 * Subscribe to raw events and process any that look like invite join
 * requests. Returns an unsubscribe function.
 *
 * Historical messages are skipped. Processing is fire-and-forget so
 * the event stream is never blocked.
 */
export function startInviteHostListener(
  subscribe: (handler: (event: CoreRawEvent) => void) => () => void,
  deps: InviteHostDeps,
): () => void {
  return subscribe((event) => {
    if (event.type !== "raw.message") return;
    if (event.isHistorical) return;

    // Fire and forget — most messages are not join requests
    void tryProcessJoinRequest(deps, event).catch(() => {
      // Silently ignore processing errors
    });
  });
}

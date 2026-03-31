import { Result } from "better-result";
import {
  tryProcessJoinRequest,
  type CoreRawEvent,
  type RawMessageEvent,
  type JoinRequestResult,
} from "@xmtp/signet-core";
import type { SignetError } from "@xmtp/signet-schemas";

interface ManagedInviteHostClient {
  readonly addMembers: (
    groupId: string,
    inboxIds: readonly string[],
  ) => Promise<Result<void, SignetError>>;
}

interface ManagedInviteHostIdentity {
  readonly id: string;
  readonly inboxId: string | null;
}

/** Dependencies required to resolve the correct managed identity for an invite. */
export interface ManagedInviteHostListenerDeps {
  /** Subscribe to raw core events and return an unsubscribe callback. */
  readonly subscribe: (handler: (event: CoreRawEvent) => void) => () => void;
  /** List the managed identities currently known to the signet. */
  readonly listIdentities: () => Promise<readonly ManagedInviteHostIdentity[]>;
  /** Resolve the XMTP wallet private key for a managed identity. */
  readonly getWalletPrivateKeyHex: (
    identityId: string,
  ) => Promise<Result<string, SignetError>>;
  /** Resolve the managed client that can mutate group membership. */
  readonly getManagedClient: (
    identityId: string,
  ) => ManagedInviteHostClient | undefined;
  /** Load the invite tag that was stored when the invite link was generated. */
  readonly getGroupInviteTag: (
    groupId: string,
  ) => Promise<Result<string | undefined, SignetError>>;
}

function isInviteCandidate(event: CoreRawEvent): event is RawMessageEvent {
  if (event.type !== "raw.message") return false;
  if (event.isHistorical) return false;
  if (typeof event.content !== "string") return false;

  const text = event.content.trim();
  return text.length >= 50 && !text.includes(" ");
}

function normalizePrivateKeyHex(value: string): string {
  return value.startsWith("0x") ? value.slice(2) : value;
}

/**
 * Attempt to process an invite join request by trying each managed identity
 * with a registered inbox ID until one validates the invite successfully.
 */
export async function dispatchInviteJoinRequestAcrossManagedIdentities(
  deps: ManagedInviteHostListenerDeps,
  event: CoreRawEvent,
): Promise<Result<JoinRequestResult, SignetError> | null> {
  if (!isInviteCandidate(event)) return null;

  const identities = await deps.listIdentities();
  let lastError: SignetError | null = null;

  for (const identity of identities) {
    if (!identity.inboxId) continue;

    const managed = deps.getManagedClient(identity.id);
    if (!managed) continue;

    const keyResult = await deps.getWalletPrivateKeyHex(identity.id);
    if (Result.isError(keyResult)) continue;

    const result = await tryProcessJoinRequest(
      {
        walletPrivateKeyHex: normalizePrivateKeyHex(keyResult.value),
        creatorInboxId: identity.inboxId,
        addMembersToGroup: (groupId, inboxIds) =>
          managed.addMembers(groupId, inboxIds),
        getGroupInviteTag: deps.getGroupInviteTag,
      },
      event,
    );

    if (result === null) return null;
    if (Result.isOk(result)) return result;
    lastError = result.error;
  }

  return lastError ? Result.err(lastError) : null;
}

/**
 * Subscribe to raw core events and process invite join requests by trying
 * each managed identity with a registered inbox ID until one validates.
 */
export function startManagedInviteHostListener(
  deps: ManagedInviteHostListenerDeps,
): () => void {
  return deps.subscribe((event) => {
    void dispatchInviteJoinRequestAcrossManagedIdentities(deps, event).catch(
      () => {
        // Ignore invite-processing failures so the raw event stream stays hot.
      },
    );
  });
}

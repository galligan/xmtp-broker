import type { AdminAccessActorType } from "@xmtp/signet-schemas";

/** Public seal disclosure for active owner-approved admin read access. */
export interface AdminReadDisclosure {
  readonly operatorId: AdminAccessActorType;
  readonly expiresAt: string;
}

/** Dependencies for the in-memory disclosure store. */
export interface AdminReadDisclosureStoreDeps {
  readonly now?: () => Date;
}

/**
 * Tracks active admin-read disclosure state per chat and admin session.
 *
 * Public seal disclosure should remain active while any approved admin session
 * still has live read access for a chat. The store therefore tracks per-chat,
 * per-session disclosure entries and exposes the aggregate current state.
 */
export interface AdminReadDisclosureStore {
  set(
    chatIds: readonly string[],
    sessionKey: string,
    disclosure: AdminReadDisclosure,
  ): readonly string[];
  delete(chatIds: readonly string[], sessionKey: string): readonly string[];
  get(chatId: string): AdminReadDisclosure | undefined;
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(value);
}

function cloneDisclosure(disclosure: AdminReadDisclosure): AdminReadDisclosure {
  return {
    operatorId: disclosure.operatorId,
    expiresAt: disclosure.expiresAt,
  };
}

function collectUniqueChatIds(chatIds: readonly string[]): string[] {
  return [...new Set(chatIds.filter((chatId) => chatId.length > 0))];
}

/** Create the in-memory store for public admin-read disclosure state. */
export function createAdminReadDisclosureStore(
  deps: AdminReadDisclosureStoreDeps = {},
): AdminReadDisclosureStore {
  const now = deps.now ?? (() => new Date());
  const entries = new Map<string, Map<string, AdminReadDisclosure>>();

  function aggregateForChat(chatId: string): AdminReadDisclosure | undefined {
    const perSession = entries.get(chatId);
    if (!perSession) {
      return undefined;
    }

    const nowMs = now().getTime();
    let latest: AdminReadDisclosure | undefined;

    for (const [sessionKey, disclosure] of perSession.entries()) {
      const expiresAt = Date.parse(disclosure.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) {
        perSession.delete(sessionKey);
        continue;
      }

      if (
        latest === undefined ||
        Date.parse(disclosure.expiresAt) > Date.parse(latest.expiresAt)
      ) {
        latest = disclosure;
      }
    }

    if (perSession.size === 0) {
      entries.delete(chatId);
      return undefined;
    }

    return latest ? cloneDisclosure(latest) : undefined;
  }

  function mutate(
    chatIds: readonly string[],
    fn: (chatId: string, perSession: Map<string, AdminReadDisclosure>) => void,
  ): readonly string[] {
    const changed: string[] = [];

    for (const chatId of collectUniqueChatIds(chatIds)) {
      const before = aggregateForChat(chatId);
      const perSession =
        entries.get(chatId) ?? new Map<string, AdminReadDisclosure>();
      fn(chatId, perSession);

      if (perSession.size > 0) {
        entries.set(chatId, perSession);
      } else {
        entries.delete(chatId);
      }

      const after = aggregateForChat(chatId);
      if (stableSerialize(before) !== stableSerialize(after)) {
        changed.push(chatId);
      }
    }

    return changed;
  }

  return {
    set(chatIds, sessionKey, disclosure) {
      return mutate(chatIds, (_chatId, perSession) => {
        perSession.set(sessionKey, cloneDisclosure(disclosure));
      });
    },

    delete(chatIds, sessionKey) {
      return mutate(chatIds, (_chatId, perSession) => {
        perSession.delete(sessionKey);
      });
    },

    get(chatId) {
      return aggregateForChat(chatId);
    },
  };
}

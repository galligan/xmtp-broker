function collectUniqueChatIds(chatIds: readonly string[]): readonly string[] {
  return [...new Set(chatIds.filter((chatId) => chatId.length > 0))];
}

/** Tracks overlapping seal-refresh rollback windows per chat. */
export interface ReadDisclosureRollbackTracker {
  enter(chatIds: readonly string[]): void;
  leave(chatIds: readonly string[]): void;
  has(chatId: string): boolean;
}

/** Create the in-memory tracker used during disclosure rollback refreshes. */
export function createReadDisclosureRollbackTracker(): ReadDisclosureRollbackTracker {
  const counts = new Map<string, number>();

  return {
    enter(chatIds) {
      for (const chatId of collectUniqueChatIds(chatIds)) {
        counts.set(chatId, (counts.get(chatId) ?? 0) + 1);
      }
    },

    leave(chatIds) {
      for (const chatId of collectUniqueChatIds(chatIds)) {
        const next = (counts.get(chatId) ?? 0) - 1;
        if (next > 0) {
          counts.set(chatId, next);
          continue;
        }
        counts.delete(chatId);
      }
    },

    has(chatId) {
      return (counts.get(chatId) ?? 0) > 0;
    },
  };
}

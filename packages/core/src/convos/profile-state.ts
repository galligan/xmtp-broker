import type { XmtpDecodedMessage } from "../xmtp-client-factory.js";
import { isEncodedConvosContent } from "./join-request-content.js";
import {
  ContentTypeProfileSnapshot,
  ContentTypeProfileUpdate,
  decodeProfileSnapshot,
  decodeProfileUpdate,
  type MemberProfileEntry,
  type ProfileSnapshotContent,
  type ProfileUpdateContent,
} from "./profile-messages.js";

export interface ResolvedProfile extends MemberProfileEntry {}

function isContentTypeMatch(
  contentType: string | undefined,
  target: { authorityId: string; typeId: string },
): boolean {
  return (
    contentType === target.typeId ||
    contentType === `${target.authorityId}/${target.typeId}:1.0`
  );
}

export function isProfileUpdateContentType(
  contentType: string | undefined,
): boolean {
  return isContentTypeMatch(contentType, ContentTypeProfileUpdate);
}

export function isProfileSnapshotContentType(
  contentType: string | undefined,
): boolean {
  return isContentTypeMatch(contentType, ContentTypeProfileSnapshot);
}

export function extractProfileUpdateContent(
  content: unknown,
): ProfileUpdateContent | undefined {
  if (isEncodedConvosContent(content)) {
    try {
      return decodeProfileUpdate(content);
    } catch {
      return undefined;
    }
  }

  if (typeof content === "object" && content !== null) {
    return content as ProfileUpdateContent;
  }

  return undefined;
}

export function extractProfileSnapshotContent(
  content: unknown,
): ProfileSnapshotContent | undefined {
  if (isEncodedConvosContent(content)) {
    try {
      return decodeProfileSnapshot(content);
    } catch {
      return undefined;
    }
  }

  if (
    typeof content === "object" &&
    content !== null &&
    "profiles" in content &&
    Array.isArray((content as { profiles?: unknown }).profiles)
  ) {
    return content as ProfileSnapshotContent;
  }

  return undefined;
}

export function resolveProfilesFromMessages(
  messages: readonly XmtpDecodedMessage[],
  memberInboxIds?: readonly string[],
): Map<string, ResolvedProfile> {
  const profilesByInboxId = new Map<string, ResolvedProfile>();
  let latestSnapshotProfiles: Map<string, MemberProfileEntry> | undefined;

  const orderedMessages = [...messages].sort((left, right) =>
    right.sentAt.localeCompare(left.sentAt),
  );

  for (const message of orderedMessages) {
    if (isProfileUpdateContentType(message.contentType)) {
      const senderInboxId = message.senderInboxId.toLowerCase();
      if (!profilesByInboxId.has(senderInboxId)) {
        const update = extractProfileUpdateContent(message.content);
        if (!update) continue;
        profilesByInboxId.set(senderInboxId, {
          inboxId: message.senderInboxId,
          ...(update.name !== undefined ? { name: update.name } : {}),
          ...(update.encryptedImage !== undefined
            ? { encryptedImage: update.encryptedImage }
            : {}),
          ...(update.memberKind !== undefined
            ? { memberKind: update.memberKind }
            : {}),
          ...(update.metadata !== undefined
            ? { metadata: update.metadata }
            : {}),
        });
      }
    } else if (
      isProfileSnapshotContentType(message.contentType) &&
      latestSnapshotProfiles === undefined
    ) {
      const snapshot = extractProfileSnapshotContent(message.content);
      if (!snapshot) continue;
      latestSnapshotProfiles = new Map(
        snapshot.profiles
          .filter((profile) => profile.inboxId.length > 0)
          .map((profile) => [profile.inboxId.toLowerCase(), profile]),
      );
    }

    if (
      memberInboxIds &&
      memberInboxIds.every((inboxId) =>
        profilesByInboxId.has(inboxId.toLowerCase()),
      )
    ) {
      break;
    }
  }

  if (latestSnapshotProfiles) {
    for (const [inboxId, profile] of latestSnapshotProfiles.entries()) {
      if (!profilesByInboxId.has(inboxId)) {
        profilesByInboxId.set(inboxId, {
          inboxId: profile.inboxId,
          ...(profile.name !== undefined ? { name: profile.name } : {}),
          ...(profile.encryptedImage !== undefined
            ? { encryptedImage: profile.encryptedImage }
            : {}),
          ...(profile.memberKind !== undefined
            ? { memberKind: profile.memberKind }
            : {}),
          ...(profile.metadata !== undefined
            ? { metadata: profile.metadata }
            : {}),
        });
      }
    }
  }

  return profilesByInboxId;
}

export function buildProfileSnapshotFromMessages(
  messages: readonly XmtpDecodedMessage[],
  memberInboxIds: readonly string[],
  options?: { readonly includeFallbackEntries?: boolean },
): ProfileSnapshotContent {
  const resolved = resolveProfilesFromMessages(messages, memberInboxIds);
  const includeFallbackEntries = options?.includeFallbackEntries ?? false;

  return {
    profiles: memberInboxIds.flatMap((inboxId) => {
      const profile = resolved.get(inboxId.toLowerCase());
      if (profile) {
        return [profile];
      }
      if (includeFallbackEntries) {
        return [{ inboxId }];
      }
      return [];
    }),
  };
}

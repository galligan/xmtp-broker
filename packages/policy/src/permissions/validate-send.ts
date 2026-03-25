import { Result } from "better-result";
import { PermissionError } from "@xmtp/signet-schemas";
import { checkChatInScope } from "./scope-check.js";

interface LegacyMessagingGrant {
  readonly send: boolean;
  readonly draftOnly: boolean;
}

interface LegacyGrantConfig {
  readonly messaging: LegacyMessagingGrant;
}

interface LegacyThreadScope {
  readonly groupId: string;
}

interface LegacyViewConfig {
  readonly threadScopes: readonly LegacyThreadScope[];
}

/** Successful send validation, including draft-only handling for legacy sessions. */
export interface SendValidation {
  readonly draftOnly: boolean;
}

function isGrantConfig(value: unknown): value is LegacyGrantConfig {
  return (
    typeof value === "object" &&
    value !== null &&
    "messaging" in value &&
    typeof value.messaging === "object" &&
    value.messaging !== null
  );
}

function isViewConfig(value: unknown): value is LegacyViewConfig {
  return (
    typeof value === "object" &&
    value !== null &&
    "threadScopes" in value &&
    Array.isArray(value.threadScopes)
  );
}

/**
 * Validates a send_message request against the resolved scope set.
 *
 * Checks that the chat is in scope and that the "send" permission
 * scope is present.
 */
export function validateSendMessage(
  request: { groupId: string },
  grant: LegacyGrantConfig,
  view: LegacyViewConfig,
): Result<SendValidation, PermissionError>;
/** Validate send permissions for legacy session grant/view callers. */
export function validateSendMessage(
  request: { groupId: string },
  scopes: ReadonlySet<string>,
  chatIds: readonly string[],
): Result<SendValidation, PermissionError>;
/** Validate send permissions for resolved v1 scope callers. */
export function validateSendMessage(
  request: { groupId: string },
  grantOrScopes: LegacyGrantConfig | ReadonlySet<string>,
  viewOrChatIds: LegacyViewConfig | readonly string[],
): Result<SendValidation, PermissionError> {
  if (isGrantConfig(grantOrScopes) && isViewConfig(viewOrChatIds)) {
    const inScope = viewOrChatIds.threadScopes.some(
      (scope: LegacyViewConfig["threadScopes"][number]) =>
        scope.groupId === request.groupId,
    );
    if (!inScope) {
      return Result.err(
        PermissionError.create(
          `Chat '${request.groupId}' is not in the session view`,
          { chatId: request.groupId },
        ),
      );
    }

    if (!grantOrScopes.messaging.send) {
      return Result.err(
        PermissionError.create("Permission denied: send", { scope: "send" }),
      );
    }

    return Result.ok({
      draftOnly: grantOrScopes.messaging.draftOnly,
    });
  }

  const scopes = grantOrScopes as ReadonlySet<string>;
  const chatIds = viewOrChatIds as readonly string[];
  const scopeResult = checkChatInScope(request.groupId, chatIds);
  if (scopeResult.isErr()) return Result.err(scopeResult.error);

  if (!scopes.has("send")) {
    return Result.err(
      PermissionError.create("Permission denied: send", { scope: "send" }),
    );
  }
  return Result.ok({ draftOnly: false });
}

/**
 * Validates a send_reply request against the resolved scope set.
 *
 * Checks that the chat is in scope and that the "reply" permission
 * scope is present.
 */
export function validateSendReply(
  request: { groupId: string },
  scopes: ReadonlySet<string>,
  chatIds: readonly string[],
): Result<void, PermissionError> {
  const scopeResult = checkChatInScope(request.groupId, chatIds);
  if (scopeResult.isErr()) return Result.err(scopeResult.error);

  if (!scopes.has("reply")) {
    return Result.err(
      PermissionError.create("Permission denied: reply", { scope: "reply" }),
    );
  }
  return Result.ok();
}

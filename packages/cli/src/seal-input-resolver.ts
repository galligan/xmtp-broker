import { Result } from "better-result";
import type {
  OperatorDisclosuresType,
  ProvenanceMapType,
  TrustTierType,
} from "@xmtp/signet-schemas";
import { PermissionError } from "@xmtp/signet-schemas";
import type {
  CredentialManager,
  OperatorManager,
} from "@xmtp/signet-contracts";
import { checkChatInScope } from "@xmtp/signet-policy";
import type { InputResolver } from "@xmtp/signet-seals";

/** Dependencies required to resolve real seal input from runtime state. */
export interface CreateSealInputResolverDeps {
  readonly credentialManager: CredentialManager;
  readonly operatorManager: OperatorManager;
  readonly trustTier: TrustTierType;
}

/**
 * Build provenance metadata for the claims surfaced on runtime-issued seals.
 *
 * Trust tier is signet-computed from the active key platform, so it is
 * treated as `verified`. Operator disclosures are still self-reported and
 * remain `declared` until later inspection or verifier upgrades land.
 */
export function buildSealProvenanceMap(input: {
  trustTier: TrustTierType;
  operatorDisclosures?: OperatorDisclosuresType | undefined;
}): ProvenanceMapType {
  const provenance: ProvenanceMapType = {
    trustTier: { source: "verified" },
  };

  if (input.operatorDisclosures?.inferenceMode !== undefined) {
    provenance["inferenceMode"] = { source: "declared" };
  }
  if (input.operatorDisclosures?.inferenceProviders !== undefined) {
    provenance["inferenceProviders"] = { source: "declared" };
  }
  if (input.operatorDisclosures?.contentEgressScope !== undefined) {
    provenance["contentEgressScope"] = { source: "declared" };
  }
  if (input.operatorDisclosures?.retentionAtProvider !== undefined) {
    provenance["retentionAtProvider"] = { source: "declared" };
  }
  if (input.operatorDisclosures?.hostingMode !== undefined) {
    provenance["hostingMode"] = { source: "declared" };
  }

  return provenance;
}

/** Create the production seal input resolver used by the runtime. */
export function createSealInputResolver(
  deps: CreateSealInputResolverDeps,
): InputResolver {
  return async (credentialId, chatId) => {
    const credResult = await deps.credentialManager.lookup(credentialId);
    if (Result.isError(credResult)) return credResult;
    const cred = credResult.value;

    const opResult = await deps.operatorManager.lookup(cred.config.operatorId);
    if (Result.isError(opResult)) return opResult;
    const op = opResult.value;

    const permissions = {
      allow: cred.config.allow ?? [],
      deny: cred.config.deny ?? [],
    };

    const inScopeResult = checkChatInScope(chatId, cred.config.chatIds);
    if (Result.isError(inScopeResult)) {
      return Result.err(
        PermissionError.create(inScopeResult.error.message, {
          ...inScopeResult.error.context,
          credentialId,
        }),
      );
    }

    const operatorDisclosures = op.config.operatorDisclosures;
    return Result.ok({
      credentialId,
      operatorId: cred.config.operatorId,
      chatId,
      scopeMode: op.config.scopeMode,
      permissions,
      trustTier: deps.trustTier,
      operatorDisclosures,
      provenanceMap: buildSealProvenanceMap({
        trustTier: deps.trustTier,
        operatorDisclosures,
      }),
    });
  };
}

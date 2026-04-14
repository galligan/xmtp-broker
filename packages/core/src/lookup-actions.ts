import { Result } from "better-result";
import { z } from "zod";
import type {
  ActionSpec,
  CredentialManager,
  OperatorManager,
  PolicyManager,
} from "@xmtp/signet-contracts";
import type { IdMappingStore, SignetError } from "@xmtp/signet-schemas";
import { parseResourceId } from "@xmtp/signet-schemas";
import type { AgentIdentity, SqliteIdentityStore } from "./identity-store.js";

/** Dependencies used to build lookup-related action specs. */
export interface LookupActionDeps {
  readonly identityStore: SqliteIdentityStore;
  readonly idMappings?: IdMappingStore;
  readonly operatorManager?: OperatorManager;
  readonly policyManager?: PolicyManager;
  readonly credentialManager?: CredentialManager;
}

/** Local/network ID mapping summary returned by `lookup.resolve`. */
export interface LookupMappingResult {
  readonly localId: string;
  readonly networkId: string;
}

/** Managed inbox summary returned by `lookup.resolve`. */
export interface LookupInboxResult {
  readonly id: string;
  readonly label: string | null;
  readonly networkInboxId: string | null;
  readonly groupId: string | null;
  readonly createdAt: string;
}

/** Operator summary returned by `lookup.resolve`. */
export interface LookupOperatorResult {
  readonly id: string;
  readonly label: string;
  readonly role: string;
  readonly status: string;
}

/** Policy summary returned by `lookup.resolve`. */
export interface LookupPolicyResult {
  readonly id: string;
  readonly label: string;
  readonly updatedAt: string;
}

/** Credential summary returned by `lookup.resolve`. */
export interface LookupCredentialResult {
  readonly id: string;
  readonly operatorId: string;
  readonly policyId: string | null;
  readonly chatIds: readonly string[];
  readonly status: string;
  readonly expiresAt: string;
}

/** Result returned by `lookup.resolve`. */
export interface LookupResolveResult {
  readonly query: string;
  readonly found: boolean;
  readonly mapping: LookupMappingResult | null;
  readonly inbox: LookupInboxResult | null;
  readonly operator: LookupOperatorResult | null;
  readonly policy: LookupPolicyResult | null;
  readonly credential: LookupCredentialResult | null;
}

function widenActionSpec<TInput, TOutput>(
  spec: ActionSpec<TInput, TOutput, SignetError>,
): ActionSpec<unknown, unknown, SignetError> {
  return spec as ActionSpec<unknown, unknown, SignetError>;
}

function toMappingResult(
  mapping: {
    networkId: string;
    localId: string;
  } | null,
): LookupMappingResult | null {
  if (!mapping) {
    return null;
  }

  return {
    localId: mapping.localId,
    networkId: mapping.networkId,
  };
}

function toInboxResult(identity: AgentIdentity): LookupInboxResult {
  return {
    id: identity.id,
    label: identity.label,
    networkInboxId: identity.inboxId,
    groupId: identity.groupId,
    createdAt: identity.createdAt,
  };
}

function isNotFoundError(error: SignetError): boolean {
  return error.category === "not_found";
}

async function resolveInbox(
  deps: LookupActionDeps,
  query: string,
  mapping: LookupMappingResult | null,
): Promise<Result<LookupInboxResult | null, SignetError>> {
  let identity: AgentIdentity | null = null;

  try {
    const parsed = parseResourceId(query);
    if (parsed.type === "inbox") {
      identity = await deps.identityStore.getById(query);
    }
  } catch {
    // Non-resource identifiers are handled below.
  }

  if (identity === null && mapping?.localId.startsWith("inbox_")) {
    identity = await deps.identityStore.getById(mapping.localId);
  }

  if (identity === null) {
    identity = await deps.identityStore.getByLabel(query);
  }

  if (identity === null) {
    identity = await deps.identityStore.getByInboxId(query);
  }

  return Result.ok(identity ? toInboxResult(identity) : null);
}

async function resolveOperator(
  deps: LookupActionDeps,
  query: string,
): Promise<Result<LookupOperatorResult | null, SignetError>> {
  if (!deps.operatorManager) {
    return Result.ok(null);
  }

  try {
    const parsed = parseResourceId(query);
    if (parsed.type === "operator") {
      const direct = await deps.operatorManager.lookup(query);
      if (Result.isError(direct)) {
        return isNotFoundError(direct.error) ? Result.ok(null) : direct;
      }

      return Result.ok({
        id: direct.value.id,
        label: direct.value.config.label,
        role: direct.value.config.role,
        status: direct.value.status,
      });
    }
  } catch {
    // Fall through to exact-label lookup.
  }

  const operators = await deps.operatorManager.list();
  if (Result.isError(operators)) {
    return operators;
  }

  const match = operators.value.find(
    (candidate) => candidate.config.label === query,
  );
  if (!match) {
    return Result.ok(null);
  }

  return Result.ok({
    id: match.id,
    label: match.config.label,
    role: match.config.role,
    status: match.status,
  });
}

async function resolvePolicy(
  deps: LookupActionDeps,
  query: string,
): Promise<Result<LookupPolicyResult | null, SignetError>> {
  if (!deps.policyManager) {
    return Result.ok(null);
  }

  try {
    const parsed = parseResourceId(query);
    if (parsed.type === "policy") {
      const direct = await deps.policyManager.lookup(query);
      if (Result.isError(direct)) {
        return isNotFoundError(direct.error) ? Result.ok(null) : direct;
      }

      return Result.ok({
        id: direct.value.id,
        label: direct.value.config.label,
        updatedAt: direct.value.updatedAt,
      });
    }
  } catch {
    // Fall through to exact-label lookup.
  }

  const policies = await deps.policyManager.list();
  if (Result.isError(policies)) {
    return policies;
  }

  const match = policies.value.find(
    (candidate) => candidate.config.label === query,
  );
  if (!match) {
    return Result.ok(null);
  }

  return Result.ok({
    id: match.id,
    label: match.config.label,
    updatedAt: match.updatedAt,
  });
}

async function resolveCredential(
  deps: LookupActionDeps,
  query: string,
): Promise<Result<LookupCredentialResult | null, SignetError>> {
  if (!deps.credentialManager) {
    return Result.ok(null);
  }

  try {
    const parsed = parseResourceId(query);
    if (parsed.type !== "credential") {
      return Result.ok(null);
    }
  } catch {
    return Result.ok(null);
  }

  const credential = await deps.credentialManager.lookup(query);
  if (Result.isError(credential)) {
    return isNotFoundError(credential.error) ? Result.ok(null) : credential;
  }

  return Result.ok({
    id: credential.value.credentialId,
    operatorId: credential.value.operatorId,
    policyId: credential.value.config.policyId ?? null,
    chatIds: credential.value.config.chatIds,
    status: credential.value.status,
    expiresAt: credential.value.expiresAt,
  });
}

/** Create ActionSpecs for lookup operations. */
export function createLookupActions(
  deps: LookupActionDeps,
): ActionSpec<unknown, unknown, SignetError>[] {
  const resolve: ActionSpec<
    { query: string },
    LookupResolveResult,
    SignetError
  > = {
    id: "lookup.resolve",
    description: "Resolve local signet resources and network ID mappings",
    intent: "read",
    idempotent: true,
    input: z.object({
      query: z.string().min(1),
    }),
    handler: async (input) => {
      let mapping = toMappingResult(
        deps.idMappings?.resolve(input.query) ?? null,
      );

      const inbox = await resolveInbox(deps, input.query, mapping);
      if (Result.isError(inbox)) {
        return inbox;
      }

      if (mapping === null && inbox.value !== null) {
        mapping =
          toMappingResult(deps.idMappings?.resolve(inbox.value.id) ?? null) ??
          toMappingResult(
            inbox.value.networkInboxId
              ? (deps.idMappings?.resolve(inbox.value.networkInboxId) ?? null)
              : null,
          );
      }

      const operator = await resolveOperator(deps, input.query);
      if (Result.isError(operator)) {
        return operator;
      }

      const policy = await resolvePolicy(deps, input.query);
      if (Result.isError(policy)) {
        return policy;
      }

      const credential = await resolveCredential(deps, input.query);
      if (Result.isError(credential)) {
        return credential;
      }

      return Result.ok({
        query: input.query,
        found:
          mapping !== null ||
          inbox.value !== null ||
          operator.value !== null ||
          policy.value !== null ||
          credential.value !== null,
        mapping,
        inbox: inbox.value,
        operator: operator.value,
        policy: policy.value,
        credential: credential.value,
      });
    },
    cli: {
      command: "lookup:resolve",
    },
    http: {
      auth: "admin",
    },
  };

  return [widenActionSpec(resolve)];
}

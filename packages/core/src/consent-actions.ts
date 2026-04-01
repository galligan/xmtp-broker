import { Result } from "better-result";
import { z } from "zod";
import type { ActionSpec } from "@xmtp/signet-contracts";
import { NotFoundError } from "@xmtp/signet-schemas";
import type { SignetError } from "@xmtp/signet-schemas";
import type { SqliteIdentityStore } from "./identity-store.js";
import type { ManagedClient } from "./client-registry.js";
import type { ConsentEntityType, ConsentState } from "./xmtp-client-factory.js";

/** Zod schema for consent entity type. */
const ConsentEntityTypeSchema = z.enum(["inbox_id", "group_id"]);

/** Zod schema for consent state. */
const ConsentStateSchema = z.enum(["unknown", "allowed", "denied"]);

/** Dependencies used to build consent-related action specs. */
export interface ConsentActionDeps {
  /** Identity store used to resolve the acting identity. */
  readonly identityStore: SqliteIdentityStore;
  /** Lookup for the managed client tied to a signet identity. */
  readonly getManagedClient: (identityId: string) => ManagedClient | undefined;
}

/**
 * Resolve an identity by label, or fall back to the first identity
 * in the store when no label is provided.
 */
async function resolveIdentity(
  identityStore: SqliteIdentityStore,
  label: string | undefined,
): Promise<
  Result<{ identityId: string; inboxId: string | null }, SignetError>
> {
  if (label) {
    const identity = await identityStore.getByLabel(label);
    if (!identity) {
      return Result.err(NotFoundError.create("identity", label) as SignetError);
    }
    return Result.ok({
      identityId: identity.id,
      inboxId: identity.inboxId,
    });
  }

  const identities = await identityStore.list();
  const first = identities[0];
  if (!first) {
    return Result.err(
      NotFoundError.create("identity", "(none)") as SignetError,
    );
  }
  return Result.ok({
    identityId: first.id,
    inboxId: first.inboxId,
  });
}

/** Resolve a managed client for an identity label. */
async function resolveManagedClient(
  deps: ConsentActionDeps,
  identityLabel?: string,
): Promise<Result<ManagedClient, SignetError>> {
  const resolved = await resolveIdentity(deps.identityStore, identityLabel);
  if (Result.isError(resolved)) return resolved;

  const managed = deps.getManagedClient(resolved.value.identityId);
  if (!managed) {
    return Result.err(
      NotFoundError.create(
        "managed-client",
        resolved.value.identityId,
      ) as SignetError,
    );
  }
  return Result.ok(managed);
}

/** Create ActionSpecs for consent management. */
export function createConsentActions(
  deps: ConsentActionDeps,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): ActionSpec<any, any, SignetError>[] {
  const check: ActionSpec<
    {
      entity: string;
      entityType?: ConsentEntityType | undefined;
      identityLabel?: string | undefined;
    },
    {
      entity: string;
      entityType: ConsentEntityType;
      state: ConsentState;
    },
    SignetError
  > = {
    id: "consent.check",
    description: "Check consent state for an entity",
    intent: "read",
    idempotent: true,
    input: z.object({
      entity: z.string().min(1),
      entityType: ConsentEntityTypeSchema.default("inbox_id").optional(),
      identityLabel: z.string().optional(),
    }),
    output: z.object({
      entity: z.string(),
      entityType: ConsentEntityTypeSchema,
      state: ConsentStateSchema,
    }),
    examples: [
      {
        name: "check inbox consent",
        input: {
          entity: "abc123def456",
          entityType: "inbox_id",
        },
        expected: {
          entity: "abc123def456",
          entityType: "inbox_id",
          state: "unknown",
        },
      },
    ],
    handler: async (input) => {
      const managedResult = await resolveManagedClient(
        deps,
        input.identityLabel,
      );
      if (Result.isError(managedResult)) return managedResult;

      const entityType: ConsentEntityType = input.entityType ?? "inbox_id";
      const stateResult = await managedResult.value.client.getConsentState(
        entityType,
        input.entity,
      );
      if (Result.isError(stateResult)) return stateResult;

      return Result.ok({
        entity: input.entity,
        entityType,
        state: stateResult.value,
      });
    },
    cli: {
      command: "consent:check",
    },
    mcp: {},
    http: {
      auth: "admin",
    },
  };

  const allow: ActionSpec<
    {
      entity: string;
      entityType?: ConsentEntityType | undefined;
      identityLabel?: string | undefined;
    },
    {
      entity: string;
      entityType: ConsentEntityType;
      state: "allowed";
    },
    SignetError
  > = {
    id: "consent.allow",
    description: "Allow messages from an entity",
    intent: "write",
    input: z.object({
      entity: z.string().min(1),
      entityType: ConsentEntityTypeSchema.default("inbox_id").optional(),
      identityLabel: z.string().optional(),
    }),
    output: z.object({
      entity: z.string(),
      entityType: ConsentEntityTypeSchema,
      state: z.literal("allowed"),
    }),
    handler: async (input) => {
      const managedResult = await resolveManagedClient(
        deps,
        input.identityLabel,
      );
      if (Result.isError(managedResult)) return managedResult;

      const entityType: ConsentEntityType = input.entityType ?? "inbox_id";
      const setResult = await managedResult.value.client.setConsentState(
        entityType,
        input.entity,
        "allowed",
      );
      if (Result.isError(setResult)) return setResult;

      return Result.ok({
        entity: input.entity,
        entityType,
        state: "allowed" as const,
      });
    },
    cli: {
      command: "consent:allow",
    },
    mcp: {},
    http: {
      auth: "admin",
    },
  };

  const deny: ActionSpec<
    {
      entity: string;
      entityType?: ConsentEntityType | undefined;
      identityLabel?: string | undefined;
    },
    {
      entity: string;
      entityType: ConsentEntityType;
      state: "denied";
    },
    SignetError
  > = {
    id: "consent.deny",
    description: "Deny messages from an entity",
    intent: "write",
    input: z.object({
      entity: z.string().min(1),
      entityType: ConsentEntityTypeSchema.default("inbox_id").optional(),
      identityLabel: z.string().optional(),
    }),
    output: z.object({
      entity: z.string(),
      entityType: ConsentEntityTypeSchema,
      state: z.literal("denied"),
    }),
    handler: async (input) => {
      const managedResult = await resolveManagedClient(
        deps,
        input.identityLabel,
      );
      if (Result.isError(managedResult)) return managedResult;

      const entityType: ConsentEntityType = input.entityType ?? "inbox_id";
      const setResult = await managedResult.value.client.setConsentState(
        entityType,
        input.entity,
        "denied",
      );
      if (Result.isError(setResult)) return setResult;

      return Result.ok({
        entity: input.entity,
        entityType,
        state: "denied" as const,
      });
    },
    cli: {
      command: "consent:deny",
    },
    mcp: {},
    http: {
      auth: "admin",
    },
  };

  return [check, allow, deny];
}

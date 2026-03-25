import { z } from "zod";
import {
  OperatorId,
  type OperatorIdType,
  CredentialId,
  type CredentialIdType,
  ConversationId,
  type ConversationIdType,
  InboxId,
  type InboxIdType,
  PolicyId,
  type PolicyIdType,
} from "./resource-id.js";
import {
  PermissionScope,
  type PermissionScopeType,
} from "./permission-scopes.js";

/**
 * Lifecycle status of a credential.
 *
 * - `pending` -- issued but not yet activated
 * - `active` -- currently valid and in use
 * - `expired` -- past its TTL
 * - `revoked` -- explicitly revoked by an admin
 */
export const CredentialStatus: z.ZodEnum<
  ["pending", "active", "expired", "revoked"]
> = z.enum(["pending", "active", "expired", "revoked"]);

/** Union of credential status literals. */
export type CredentialStatusType = "pending" | "active" | "expired" | "revoked";

/**
 * Configuration used to issue a new credential.
 *
 * Scopes an operator to specific conversations, with optional
 * policy reference and inline allow/deny overrides.
 */
export type CredentialConfigType = {
  operatorId: OperatorIdType;
  chatIds: ConversationIdType[];
  policyId?: PolicyIdType | undefined;
  allow?: PermissionScopeType[] | undefined;
  deny?: PermissionScopeType[] | undefined;
  ttlSeconds?: number | undefined;
};

/** Zod schema for {@link CredentialConfigType}. */
export const CredentialConfig: z.ZodType<CredentialConfigType> = z
  .object({
    /** Which operator this credential is for. */
    operatorId: OperatorId,
    /** Scoped conversations this credential grants access to. */
    chatIds: z.array(ConversationId).min(1),
    /** Reference to a reusable permission policy. */
    policyId: PolicyId.optional(),
    /** Inline permission scopes to allow (merged with policy). */
    allow: z.array(PermissionScope).optional(),
    /** Inline permission scopes to deny (merged with policy). */
    deny: z.array(PermissionScope).optional(),
    /** Time-to-live in seconds. Defaults to 3600 (1 hour). */
    ttlSeconds: z.number().int().positive().optional().default(3600),
  })
  .describe("Configuration for issuing a new credential");

/**
 * Actor that issued a credential.
 *
 * The current runtime can issue credentials directly as the signet owner
 * via admin auth, or via a delegated admin/superadmin operator flow.
 */
export const CredentialIssuer: z.ZodUnion<
  [z.ZodType<string>, z.ZodLiteral<"owner">]
> = z.union([OperatorId, z.literal("owner")]);

/** Type for a credential issuer. */
export type CredentialIssuerType = OperatorIdType | "owner";

/**
 * Persisted credential record with identity, status, and timestamps.
 */
export type CredentialRecordType = {
  id: CredentialIdType;
  config: CredentialConfigType;
  inboxIds: InboxIdType[];
  status: CredentialStatusType;
  issuedAt: string;
  expiresAt: string;
  issuedBy: CredentialIssuerType;
};

/** Zod schema for {@link CredentialRecordType}. */
export const CredentialRecord: z.ZodType<CredentialRecordType> = z
  .object({
    /** Unique credential identifier (`cred_` prefix). */
    id: CredentialId,
    /** The credential configuration. */
    config: CredentialConfig,
    /** XMTP inboxes bound to this credential. */
    inboxIds: z.array(InboxId),
    /** Current lifecycle status. */
    status: CredentialStatus,
    /** ISO 8601 timestamp when the credential was issued. */
    issuedAt: z.string().datetime(),
    /** ISO 8601 timestamp when the credential expires. */
    expiresAt: z.string().datetime(),
    /** Owner or delegated operator that issued this credential. */
    issuedBy: CredentialIssuer,
  })
  .describe("Persisted credential record");

/**
 * Opaque credential token metadata returned for verification.
 */
export type CredentialTokenType = {
  credentialId: CredentialIdType;
  operatorId: OperatorIdType;
  fingerprint: string;
  issuedAt: string;
  expiresAt: string;
};

/** Zod schema for {@link CredentialTokenType}. */
export const CredentialToken: z.ZodType<CredentialTokenType> = z
  .object({
    /** Credential this token belongs to. */
    credentialId: CredentialId,
    /** Operator this token was issued for. */
    operatorId: OperatorId,
    /** Token fingerprint for verification. */
    fingerprint: z.string(),
    /** ISO 8601 timestamp when the token was issued. */
    issuedAt: z.string().datetime(),
    /** ISO 8601 timestamp when the token expires. */
    expiresAt: z.string().datetime(),
  })
  .describe("Credential token metadata for verification");

/**
 * Issued credential containing the bearer token (shown once)
 * and the full credential record.
 */
export type IssuedCredentialType = {
  token: string;
  credential: CredentialRecordType;
};

/** Zod schema for {@link IssuedCredentialType}. */
export const IssuedCredential: z.ZodType<IssuedCredentialType> = z
  .object({
    /** The bearer token, shown only at issuance. */
    token: z.string().min(1),
    /** The credential record. */
    credential: CredentialRecord,
  })
  .describe("Issued credential with bearer token");

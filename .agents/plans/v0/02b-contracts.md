# 02b — Contracts

**Package:** `@xmtp/signet-contracts`
**Spec version:** 0.1.0

## Overview

The contracts package defines cross-package interfaces that runtime packages implement and consume. It sits between `@xmtp/signet-schemas` (data shapes) and the runtime tier, providing a stable interface layer that decouples packages from each other's implementations.

**Split principle:** Schemas answer "what shape is the data?" while contracts answer "what can components do to each other?" This keeps `schemas` zero-dep beyond Zod, and gives runtime packages a single place to find the interfaces they implement or depend on.

This package contains no runtime logic -- only TypeScript interfaces, type aliases, and the signed envelope schemas that define protocol wire formats.

## Dependencies

**Imports:** `@xmtp/signet-schemas` (sole workspace dependency), `better-result` (for `Result` type in interface signatures)

**Imported by:** All runtime packages (`core`, `policy`, `sessions`, `attestations`, `keys`), transport packages (`ws`)

## Contract Catalog

### Service Interfaces

Interfaces implemented by runtime packages to provide their core functionality. These define the "manager" APIs that transport adapters orchestrate.

| Interface | Source spec | Description |
|-----------|-----------|-------------|
| `SignetCore` | 03 | Top-level broker lifecycle: initialize, shutdown, state transitions |
| `SessionManager` | 05 | Session issuance, lookup, revocation, heartbeat processing |
| `SealManager` | 06 | Seal lifecycle: issue, refresh, revoke, query |

```typescript
interface SignetCore {
  readonly state: CoreState;
  initialize(): Promise<Result<void, SignetError>>;
  shutdown(): Promise<Result<void, SignetError>>;
  getGroupInfo(groupId: string): Promise<Result<GroupInfo, SignetError>>;
}

interface SessionManager {
  issue(config: SessionConfig): Promise<Result<SessionToken, SignetError>>;
  lookup(sessionId: string): Promise<Result<SessionRecord, SignetError>>;
  revoke(sessionId: string, reason: SessionRevocationReason): Promise<Result<void, SignetError>>;
  heartbeat(sessionId: string): Promise<Result<void, SignetError>>;
  isActive(sessionId: string): Promise<Result<boolean, SignetError>>;
}

interface SealManager {
  issue(sessionId: string, groupId: string): Promise<Result<SignedAttestation, SignetError>>;
  refresh(attestationId: string): Promise<Result<SignedAttestation, SignetError>>;
  revoke(attestationId: string, reason: AgentRevocationReason): Promise<Result<void, SignetError>>;
  current(agentInboxId: string, groupId: string): Promise<Result<SignedAttestation | null, SignetError>>;
}
```

### Provider Interfaces

Interfaces that abstract external dependencies. Runtime packages depend on these abstractions; concrete implementations live in the implementing package.

| Interface | Source spec | Description |
|-----------|-----------|-------------|
| `SignerProvider` | 03/07 | Abstracts key material for signing operations |
| `AttestationSigner` | 06 | Signs seal payloads |
| `AttestationPublisher` | 06 | Publishes signed seals to groups |
| `RevealStateStore` | 04 | Persists and queries reveal grant state |

```typescript
interface SignerProvider {
  sign(data: Uint8Array): Promise<Result<Uint8Array, SignetError>>;
  getPublicKey(): Promise<Result<Uint8Array, SignetError>>;
  getFingerprint(): Promise<Result<string, SignetError>>;
}

interface AttestationSigner {
  sign(payload: Attestation): Promise<Result<SignedAttestation, SignetError>>;
  signRevocation(payload: RevocationAttestation): Promise<Result<SignedRevocationEnvelope, SignetError>>;
}

interface AttestationPublisher {
  publish(groupId: string, attestation: SignedAttestation): Promise<Result<void, SignetError>>;
  publishRevocation(groupId: string, revocation: SignedRevocationEnvelope): Promise<Result<void, SignetError>>;
}

interface RevealStateStore {
  grant(revealGrant: RevealGrant): Promise<Result<void, SignetError>>;
  revoke(revealId: string): Promise<Result<void, SignetError>>;
  activeReveals(sessionId: string): Promise<Result<RevealState, SignetError>>;
  isRevealed(sessionId: string, messageId: string): Promise<Result<boolean, SignetError>>;
}
```

### Core Types

Types and interfaces that multiple runtime packages reference but that aren't Zod schemas. These define runtime concepts that don't need validation at boundaries.

| Type | Source spec | Description |
|------|-----------|-------------|
| `CoreState` | 03 | Union of broker lifecycle states |
| `CoreContext` | 03 | Context object passed to handlers during broker operations |
| `GroupInfo` | 03 | Broker-internal representation of a group's state |
| `RawMessage` | 04 | Unfiltered message from the XMTP client |
| `RawEvent` | 03 | Union of raw XMTP events before view filtering |
| `SessionRecord` | 05 | Internal session state (superset of `SessionToken`) |
| `MaterialityCheck` | 05 | Result of checking whether a policy change is material |
| `PolicyDelta` | 04/06 | Describes a change between two policy configurations |
| `MessageProvenanceMetadata` | 06 | Provenance info attached to outbound messages |
| `GrantError` | 04 | Type alias for grant enforcement error results |

```typescript
type CoreState = "uninitialized" | "initializing" | "ready" | "shutting-down" | "stopped" | "error";

interface CoreContext {
  readonly brokerId: string;
  readonly signerProvider: SignerProvider;
}

interface GroupInfo {
  readonly groupId: string;
  readonly identityKeyFingerprint: string;
  readonly memberInboxIds: readonly string[];
  readonly createdAt: string;
}

interface RawMessage {
  readonly messageId: string;
  readonly groupId: string;
  readonly senderInboxId: string;
  readonly contentType: ContentTypeId;
  readonly content: unknown;
  readonly sentAt: string;
}

type RawEvent =
  | { readonly type: "message"; readonly message: RawMessage }
  | { readonly type: "group.member_added"; readonly groupId: string; readonly inboxId: string }
  | { readonly type: "group.member_removed"; readonly groupId: string; readonly inboxId: string }
  | { readonly type: "group.metadata_updated"; readonly groupId: string; readonly fields: Record<string, string> };

interface SessionRecord {
  readonly sessionId: string;
  readonly agentInboxId: string;
  readonly sessionKeyFingerprint: string;
  readonly view: ViewConfig;
  readonly grant: GrantConfig;
  readonly state: SessionState;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly lastHeartbeat: string;
}

interface MaterialityCheck {
  readonly isMaterial: boolean;
  readonly reason: string | null;
  readonly delta: PolicyDelta | null;
}

interface PolicyDelta {
  readonly viewChanges: ReadonlyArray<{ field: string; from: unknown; to: unknown }>;
  readonly grantChanges: ReadonlyArray<{ field: string; from: unknown; to: unknown }>;
  readonly contentTypeChanges: {
    readonly added: readonly ContentTypeId[];
    readonly removed: readonly ContentTypeId[];
  };
}

interface MessageProvenanceMetadata {
  readonly attestationId: string;
  readonly sessionKeyFingerprint: string;
  readonly policyHash: string;
}

type GrantError = GrantDeniedError | PermissionError;
```

### Protocol Wire Formats

Signed envelope schemas for seals published to groups. These are Zod schemas (not plain interfaces) because they define wire formats that must be validated at boundaries. They live in contracts rather than schemas because they compose schemas with signing metadata that only makes sense in the context of the seal/signing contracts.

```typescript
const SignedAttestationEnvelope = z.object({
  attestation: AttestationSchema.describe("The seal payload"),
  signature: z.string().describe("Base64-encoded signature over the canonical seal bytes"),
  signingAlgorithm: z.string().describe("Algorithm used to produce the signature"),
  signingKeyRef: z.string().describe("Reference to the key that produced the signature"),
}).describe("Signed seal ready for group publication");

type SignedAttestation = z.infer<typeof SignedAttestationEnvelope>;

const SignedRevocationEnvelope = z.object({
  revocation: RevocationAttestation.describe("The revocation payload"),
  signature: z.string().describe("Base64-encoded signature over the canonical revocation bytes"),
  signingAlgorithm: z.string().describe("Algorithm used to produce the signature"),
  signingKeyRef: z.string().describe("Reference to the key that produced the signature"),
}).describe("Signed revocation ready for group publication");

type SignedRevocationEnvelope = z.infer<typeof SignedRevocationEnvelope>;
```

## File Layout

```
packages/contracts/
  package.json
  tsconfig.json
  src/
    index.ts                    # Re-exports all public API
    services.ts                 # SignetCore, SessionManager, SealManager
    providers.ts                # SignerProvider, AttestationSigner, AttestationPublisher, RevealStateStore
    core-types.ts               # CoreState, CoreContext, GroupInfo, RawMessage, RawEvent
    session-types.ts            # SessionRecord, MaterialityCheck
    policy-types.ts             # PolicyDelta, GrantError
    attestation-types.ts        # MessageProvenanceMetadata, SignedAttestationEnvelope, SignedRevocationEnvelope
    __tests__/
      envelope.test.ts          # Signed envelope schema validation
```

Each source file stays well under 200 LOC. Interfaces are pure declarations with no runtime logic, so test coverage focuses on the signed envelope schemas (the only Zod schemas in this package).

## Package Configuration

```jsonc
{
  "name": "@xmtp/signet-contracts",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "bun build ./src/index.ts --outdir ./dist --target bun",
    "typecheck": "tsc --noEmit",
    "lint": "oxlint .",
    "test": "bun test"
  },
  "dependencies": {
    "@xmtp/signet-schemas": "workspace:*",
    "better-result": "catalog:",
    "zod": "catalog:"
  },
  "devDependencies": {
    "typescript": "catalog:"
  }
}
```

## Notes

- **Minimize re-exports.** Each item has one canonical home. Runtime packages import interfaces from `@xmtp/signet-contracts`, data shapes from `@xmtp/signet-schemas`. Neither re-exports from the other.
- **No circular deps.** `contracts` imports from `schemas` only. Runtime packages import from both `schemas` and `contracts` but never from each other's internals.
- **Interface evolution.** Adding a new optional method to a service interface is non-breaking. Adding a required method requires coordinating across implementing packages -- treat it as a material change.
- **`zod` in contracts.** The signed envelope schemas are the only Zod usage in this package. They exist here (not in `schemas`) because they compose seal schemas with signing metadata that is part of the contract, not the data shape.

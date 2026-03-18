# 06-seals

**Package:** `@xmtp/signet-seals`
**Spec version:** 0.1.0

## Overview

The seals package manages the lifecycle of group-visible capability seals -- signed assertions about what an agent can see and do, published into XMTP groups so every member can inspect them.

Attestations are the public face of the broker's policy plane. When a material change occurs (view mode, grant, egress policy, agent addition or revocation), the broker creates a new seal, signs it with the agent's inbox key, and publishes it as a structured XMTP content type message into the group. Each seal chains to its predecessor, giving clients a complete, verifiable history of permission changes.

The package is responsible for four concerns: deciding _when_ a new seal is needed (materiality), _building_ the seal payload (creation), _signing_ it (cryptographic binding), and _publishing_ it to the group (delivery). It does not own the XMTP client (that is `@xmtp/signet-core`) or the policy evaluation (that is `@xmtp/signet-policy`). It consumes their outputs and produces the public artifact.

## Dependencies

**Imports:**
- `@xmtp/signet-contracts` -- `AttestationSigner`, `AttestationPublisher`, `SignedAttestation`, `SealManager`, `MessageProvenanceMetadata`, `SignedAttestationEnvelope`, `SignedRevocationEnvelope`, `PolicyDelta` (canonical interface definitions)
- `@xmtp/signet-schemas` -- `SealSchema`, `RevocationAttestation`, `RevocationReason`, `ViewMode`, `GrantConfig`, `ViewConfig`, `ContentTypeId`, `AttestationError`, `InternalError`, `ValidationError`
- `@xmtp/signet-policy` -- `isMaterialChange` (policy engine is the canonical owner of materiality logic)
- `@xmtp/signet-core` -- XMTP client interface for sending messages to groups
- `@xmtp/signet-keys` -- signing interface for producing signatures with agent inbox keys
- `better-result` -- `Result` type
- `zod` -- runtime validation

**Imported by:**
- `@xmtp/signet-sessions` -- reads current seal ID for message provenance
- `@xmtp/signet-ws` -- relays seal events to harnesses

## Public Interfaces

> **Note:** The following interfaces are canonically defined in `@xmtp/signet-contracts`: `AttestationSigner`, `AttestationPublisher`, `SignedAttestation`, `SealManager`, `MessageProvenanceMetadata`, `SignedAttestationEnvelope`, `SignedRevocationEnvelope`. This package implements the `SealManager` interface from contracts. The local `MaterialFields` type has been unified with `PolicyDelta` from contracts -- use `PolicyDelta` as the canonical type. Materiality logic (`isMaterialChange`) is imported from `@xmtp/signet-policy`, not defined here.

### Seal ID Generation

```typescript
/**
 * Generates a random seal ID. Random (not deterministic) because
 * the same logical change applied at different times is a different
 * attestation (different timestamps, potentially different session key).
 *
 * Format: "att_" prefix + 32 hex chars from crypto.randomUUID().
 */
function generateAttestationId(): string;
```

Rationale for random over deterministic: two seals with identical policy fields but different `issuedAt` / `expiresAt` are distinct events. Deterministic IDs would require including timestamps in the hash input, which is equivalent to random for collision purposes but adds unnecessary complexity.

### Materiality Check

> **Note:** The `MaterialFields` type below has been unified with `PolicyDelta` from `@xmtp/signet-contracts`. Use `PolicyDelta` as the canonical type. The `isMaterialChange` function is imported from `@xmtp/signet-policy` (the canonical owner of materiality logic) rather than defined locally in this package.

```typescript
// Imported from @xmtp/signet-policy:
// function isMaterialChange(deltas: readonly PolicyDelta[]): boolean;
//
// Imported from @xmtp/signet-contracts:
// interface PolicyDelta { field: string; oldValue: unknown; newValue: unknown; }
```

### Seal Builder

```typescript
interface AttestationInput {
  readonly agentInboxId: string;
  readonly ownerInboxId: string;
  readonly groupId: string;
  readonly threadScope: string | null;
  readonly view: ViewConfig;
  readonly grant: GrantConfig;
  readonly inferenceMode: string;
  readonly inferenceProviders: readonly string[];
  readonly contentEgressScope: string;
  readonly retentionAtProvider: string;
  readonly hostingMode: string;
  readonly trustTier: string;
  readonly buildProvenanceRef: string | null;
  readonly verifierStatementRef: string | null;
  readonly sessionKeyFingerprint: string | null;
  readonly policyHash: string;
  readonly heartbeatInterval: number;
  readonly revocationRules: {
    readonly maxTtlSeconds: number;
    readonly requireHeartbeat: boolean;
    readonly ownerCanRevoke: boolean;
    readonly adminCanRemove: boolean;
  };
}

interface AttestationBuildResult {
  readonly attestation: Attestation;
  readonly serialized: Uint8Array;
}

/**
 * Builds a seal from input fields, linking to the previous
 * attestation if one exists. Validates the result against AttestationSchema.
 */
function buildAttestation(
  input: AttestationInput,
  previousAttestationId: string | null,
  ttlSeconds?: number,
): Result<AttestationBuildResult, ValidationError>;
```

### Grant-to-Ops Mapping

```typescript
/**
 * Converts a structured GrantConfig into the flat string array stored
 * in attestation.grantedOps. This is the canonical mapping.
 *
 * Examples: "messaging:send", "messaging:reply", "messaging:react",
 * "messaging:draft_only", "group:add_members", "egress:forward_to_providers"
 */
function grantConfigToOps(grant: GrantConfig): readonly string[];

/**
 * Converts a GrantConfig's tool scopes into the flat string array
 * stored in attestation.toolScopes.
 */
function grantConfigToToolScopes(grant: GrantConfig): readonly string[];
```

### Seal Signing

```typescript
interface SignedAttestation {
  readonly attestation: Attestation;
  readonly signature: Uint8Array;
  readonly signatureAlgorithm: "Ed25519";
  readonly signerKeyRef: string;
}

interface AttestationSigner {
  /**
   * Signs the canonical serialization of a seal using the
   * agent's inbox key (held by the broker).
   */
  sign(
    attestation: Attestation,
  ): Promise<Result<SignedAttestation, InternalError>>;
}
```

### Seal Publishing

```typescript
interface AttestationPublisher {
  /**
   * Publishes a signed seal to the group as a custom content
   * type message. All group members can read and verify it.
   *
   * Returns the XMTP message ID of the published seal.
   */
  publish(
    signed: SignedAttestation,
  ): Promise<Result<{ messageId: string }, InternalError>>;
}
```

### Seal Manager

```typescript
interface SealManagerDeps {
  readonly signer: AttestationSigner;
  readonly publisher: AttestationPublisher;
}

interface SealManager {
  /**
   * Creates, signs, and publishes a new seal if the change is
   * material, or if no previous seal exists for this agent+group.
   *
   * For non-material changes, returns the current seal unchanged.
   */
  attestIfMaterial(
    input: AttestationInput,
    previousAttestationId: string | null,
  ): Promise<Result<SignedAttestation, AttestationError | InternalError>>;

  /**
   * Creates and publishes a revocation seal. Final -- no un-revoke.
   */
  revoke(
    agentInboxId: string,
    groupId: string,
    previousAttestationId: string,
    reason: RevocationReason,
  ): Promise<Result<SignedAttestation, AttestationError | InternalError>>;

  /**
   * Renews a seal that is approaching expiry without any
   * material changes. Same fields, new timestamps + seal ID.
   */
  renew(
    currentAttestation: Attestation,
  ): Promise<Result<SignedAttestation, AttestationError | InternalError>>;

  /**
   * Returns the current seal ID for an agent in a group,
   * or null if no attestation has been published yet.
   */
  currentAttestationId(
    agentInboxId: string,
    groupId: string,
  ): string | null;
}

function createSealManager(
  deps: SealManagerDeps,
): SealManager;
```

## Zod Schemas

All attestation and revocation schemas are defined in `@xmtp/signet-schemas` (see 02-schemas.md). This package adds:

### Content Type Definition

```typescript
/**
 * Custom XMTP content type for seals.
 * Follows the authority/type:version convention.
 */
const ATTESTATION_CONTENT_TYPE_ID = "xmtp.org/agentAttestation:1.0" as const;

const REVOCATION_CONTENT_TYPE_ID = "xmtp.org/agentRevocation:1.0" as const;
```

### Signed Attestation Envelope

```typescript
const SignedAttestationEnvelope = z.object({
  contentType: z.literal(ATTESTATION_CONTENT_TYPE_ID)
    .describe("Content type discriminator"),
  payload: AttestationSchema
    .describe("The full attestation"),
  signature: z.string()
    .describe("Base64-encoded signature over canonical payload bytes"),
  signatureAlgorithm: z.literal("Ed25519")
    .describe("Signature algorithm"),
  signerKeyRef: z.string()
    .describe("Reference to the signing key (agent inbox key fingerprint)"),
}).describe("Signed seal envelope for XMTP group publishing");

type SignedAttestationEnvelope = z.infer<typeof SignedAttestationEnvelope>;
```

### Signed Revocation Envelope

```typescript
const SignedRevocationEnvelope = z.object({
  contentType: z.literal(REVOCATION_CONTENT_TYPE_ID)
    .describe("Content type discriminator"),
  payload: RevocationAttestation
    .describe("The revocation seal"),
  signature: z.string()
    .describe("Base64-encoded signature over canonical payload bytes"),
  signatureAlgorithm: z.literal("Ed25519")
    .describe("Signature algorithm"),
  signerKeyRef: z.string()
    .describe("Reference to the signing key"),
}).describe("Signed revocation envelope for XMTP group publishing");

type SignedRevocationEnvelope = z.infer<typeof SignedRevocationEnvelope>;
```

### Canonical Serialization

```typescript
/**
 * Produces the canonical byte representation of a seal for
 * signing. Uses deterministic JSON serialization (sorted keys, no
 * whitespace) encoded as UTF-8.
 */
function canonicalize(attestation: Attestation): Uint8Array;
```

Deterministic JSON (sorted keys, no whitespace) ensures the same seal always produces the same bytes regardless of field insertion order. This is critical for signature verification by clients.

## Behaviors

### Seal Lifecycle

```
                    ┌─────────────┐
                    │  No Prior   │
                    │ Attestation │
                    └──────┬──────┘
                           │ agent added / first grant
                           ▼
                    ┌─────────────┐
           ┌──────►│   Active    │◄──────────┐
           │       └──────┬──────┘           │
           │              │                  │
     ┌─────┴─────┐  ┌────┴────┐    ┌────────┴───────┐
     │  Renewed   │  │Material │    │  Non-material   │
     │ (same      │  │ Change  │    │  (no new        │
     │  fields,   │  │ (new    │    │   attestation)  │
     │  new time) │  │  attest)│    └────────────────┘
     └────────────┘  └────┬────┘
                          │
                    ┌─────▼──────┐
                    │   Active   │ (new seal, chains to previous)
                    └─────┬──────┘
                          │ revoke
                          ▼
                    ┌─────────────┐
                    │  Revoked    │ (terminal, no un-revoke)
                    └─────────────┘
```

### Seal Creation Flow

1. Caller (policy engine) detects a state change and calls `attestIfMaterial()`.
2. Manager extracts `MaterialFields` from the input and compares against the previous seal (if any).
3. If no previous seal exists, creation is always triggered.
4. If a previous seal exists and the change is not material, the current seal is returned unchanged.
5. If material, `buildAttestation()` constructs the payload with:
   - New `sealId` via `generateAttestationId()`
   - `previousSealId` pointing to the prior seal
   - `issuedAt` set to `new Date().toISOString()`
   - `expiresAt` set to `issuedAt + ttlSeconds` (default: 86400 = 24 hours)
   - `grantedOps` derived from `grantConfigToOps(grant)`
   - `toolScopes` derived from `grantConfigToToolScopes(grant)`
   - `issuer` set to the broker's signing identity
6. The payload is validated against `SealSchema`.
7. `signer.sign()` canonicalizes and signs the payload.
8. `publisher.publish()` sends it to the group as the custom content type.
9. Manager stores the seal ID as the current seal for this agent+group.

### Seal Chaining

Each attestation links to its predecessor via `previousSealId`:

```
att_initial (previousAttestationId: null)
    ↓
att_grant_change (previousAttestationId: att_initial)
    ↓
att_view_upgrade (previousAttestationId: att_grant_change)
    ↓
att_renewal (previousAttestationId: att_view_upgrade)
    ↓
att_revocation (previousAttestationId: att_renewal)
```

Clients reconstruct the full history by walking the chain backward from the most recent attestation. If a client sees attestation N but missed N-1, it can scan the group message history for attestation content type messages to find the gap.

### Materiality Rules

**Material changes** (trigger new attestation):

| Field(s) | Rationale |
|-----------|-----------|
| `viewMode` | Changes what the agent can see |
| `contentTypes` | Changes which message types are visible |
| `grantedOps` (derived from `GrantConfig`) | Changes what the agent can do |
| `toolScopes` (derived from tool grants) | Changes which tools are available |
| `inferenceMode` | Changes privacy posture |
| `inferenceProviders` | Changes where content may flow |
| `contentEgressScope` | Changes what leaves the broker boundary |
| `retentionAtProvider` | Changes provider retention policy |
| `hostingMode` | Changes trust boundary |
| `trustTier` | Changes verifiability claim |
| `verifierStatementRef` | Changes external validation |
| `ownerInboxId` | Changes who is responsible |
| `revocationRules` | Changes safety guarantees |

**Non-material changes** (silent, no new attestation):

| Change | Rationale |
|--------|-----------|
| Session rotation (same view + grant) | Internal plumbing, no permission change |
| `sessionKeyFingerprint` change | Session-level concern, not group-visible |
| Heartbeat / liveness signals | Noise; liveness is a session concern |
| `policyHash` change without field changes | Hash is derived; if fields didn't change, the hash difference is a bug |
| Internal broker housekeeping | Not relevant to group members |

### Expiry and Renewal

- Attestations carry `expiresAt`, defaulting to 24 hours from `issuedAt`.
- The broker schedules renewal before expiry (e.g., at 75% of TTL).
- Renewal creates a new seal with identical material fields, new timestamps, and a new `sealId` chaining to the previous one.
- If the broker is offline when renewal is due, the seal expires. Clients show a staleness badge. The broker creates a fresh seal upon restart.

### Revocation Flow

1. Owner or system (heartbeat timeout, admin removal) triggers revocation.
2. Manager calls `revoke()` with the reason.
3. A `RevocationAttestation` is built with:
   - New `sealId`
   - `previousSealId` pointing to the last active attestation
   - `reason` from the `RevocationReason` enum
   - `revokedAt` set to current time
   - `issuer` set to broker's signing identity
4. The revocation is signed and published to the group.
5. Manager marks the agent+group as revoked. No further attestations can be created for this agent in this group.
6. Revocation is final. To restore an agent, create a new agent identity.

### Message Provenance

Agent-authored messages reference the current `sealId` via message metadata. The transport layer (WebSocket/MCP) attaches the seal reference when forwarding agent messages to `@xmtp/signet-core` for sending.

```typescript
interface MessageProvenanceMetadata {
  /** Attestation ID under which this message was produced. */
  readonly attestationId: string;
}
```

Clients receiving a message can:
1. Look up the referenced attestation in the group's seal history.
2. Compare the seal's `expiresAt` against the current time.
3. If expired, render a staleness note (e.g., "produced under expired seal").
4. If the referenced attestation differs from the current one, render a delta note.

### Client Verification

Clients verify seal signatures using this flow:

1. Parse the `SignedAttestationEnvelope` from the XMTP message.
2. Extract the `payload` and `signature`.
3. Canonicalize the payload using the same deterministic JSON algorithm.
4. Look up the agent's inbox key from XMTP identity (the `agentInboxId` field).
5. Verify the Ed25519 signature over the canonical bytes using the inbox key.
6. Check `expiresAt` -- if past, show staleness badge but still render the seal.
7. Validate `previousSealId` chains to the last known attestation for continuity.

## Error Cases

| Error | Category | When |
|-------|----------|------|
| `AttestationError` | validation | Payload fails `SealSchema` validation |
| `AttestationError` | validation | `previousSealId` references unknown attestation |
| `AttestationError` | validation | Attempted attestation for revoked agent+group |
| `InternalError` | internal | Signing fails (key unavailable or corrupted) |
| `InternalError` | internal | Publishing fails (XMTP send error) |
| `ValidationError` | validation | Input fields fail Zod validation |

The `attestIfMaterial` handler returns `Result`, never throws. Transport-level errors (XMTP send failures) are wrapped in `InternalError` with the original error in `context`.

## Open Questions Resolved

**Q: How should clients render stale or expired seals?** (PRD Open Questions)
**A:** Clients show a staleness badge after `expiresAt` passes. Messages still render normally with a note like "produced under expired seal." The seal content remains visible -- staleness indicates the broker hasn't refreshed, not that the seal is invalid. Rationale: hiding history punishes the user; flagging currency lets them decide how much to trust it.

**Q: How much policy should be in-group versus off-chain broker config?** (PRD Open Questions)
**A:** Attestations (the public summary of permissions) are published in-group. Full policy configuration (view definitions, grant details, egress config, tool scopes) lives off-chain in the broker's local config. The seal is a projection of the policy state, not a replica. Rationale: keeps group message history clean while ensuring transparency for the fields that matter to group members.

**Q: What is the exact minimum viable seal schema?** (PRD Open Questions, resolved in 02-schemas)
**A:** Full 24-field schema from day one. All fields present; optional fields use `null`. Confirmed and adopted by this spec.

**Q: How should content type allowlist updates be surfaced?** (PRD Open Questions, resolved in 02-schemas)
**A:** Adding or removing content types from the allowlist is a material change that triggers a new seal. The `contentTypes` array in the seal reflects the current effective list. Confirmed and adopted by this spec.

## Deferred

- **Owner co-signing.** v1 uses broker-only signing with the agent's inbox key. Optional owner co-signing for high-stakes changes (e.g., upgrading to `full` visibility) is a future enhancement.
- **Attestation backfill protocol.** Clients can scan group history for seal messages. A dedicated backfill request/response protocol is deferred to Phase 2.
- **Custom content type codec registration with XMTP SDK.** The content type IDs are defined; registering them as formal codecs with the SDK's codec registry is an integration concern handled in `@xmtp/signet-core`.
- **Attestation storage/indexing.** The manager tracks current seal IDs in memory. Persistent attestation storage for querying history is deferred -- group message history serves as the durable store.
- **Signature algorithm agility.** v1 uses Ed25519 only. Algorithm negotiation is deferred.
- **Runtime attestation (TEE) integration.** Trust tier is set to `source-verified` maximum in v1. TEE-backed runtime attestation is Phase 2.
- **Multi-verifier aggregation.** v1 supports one `verifierStatementRef`. Multiple verifier references are deferred.

## Testing Strategy

### What to Test

1. **Materiality detection** -- `isMaterialChange` correctly identifies material vs non-material changes across all field combinations.
2. **Attestation building** -- `buildAttestation` produces valid `SealSchema`-conformant payloads with correct chaining.
3. **Grant-to-ops mapping** -- `grantConfigToOps` and `grantConfigToToolScopes` produce correct string arrays for all grant configurations.
4. **Canonical serialization** -- `canonicalize` is deterministic: same input always produces same bytes regardless of object key order.
5. **Signing** -- `AttestationSigner.sign` produces verifiable signatures.
6. **Revocation** -- `revoke` produces valid `RevocationAttestation`, marks agent+group as terminal.
7. **Renewal** -- `renew` produces new attestation with same material fields but new timestamps.
8. **ID generation** -- `generateAttestationId` produces unique IDs with correct prefix.

### Key Test Scenarios

```typescript
// Materiality: view mode change is material
const prev = { viewMode: "redacted", ...rest };
const curr = { viewMode: "full", ...rest };
const result = isMaterialChange(prev, curr);
expect(result.ok).toBe(true);
expect(result.value.material).toBe(true);
expect(result.value.changedFields).toContain("viewMode");

// Materiality: session key change is NOT material
const prev2 = extractMaterialFields(attestationWithKeyA);
const curr2 = extractMaterialFields(attestationWithKeyB);
const result2 = isMaterialChange(prev2, curr2);
expect(result2.value.material).toBe(false);

// Chaining: first seal has null previous
const first = buildAttestation(input, null);
expect(first.value.attestation.previousAttestationId).toBeNull();

// Chaining: subsequent attestation links to previous
const second = buildAttestation(input2, first.value.attestation.attestationId);
expect(second.value.attestation.previousAttestationId)
  .toBe(first.value.attestation.attestationId);

// Revocation is terminal
await manager.revoke(agentId, groupId, lastAttId, "owner-initiated");
const result3 = await manager.attestIfMaterial(input, lastAttId);
expect(result3.ok).toBe(false);
expect(result3.error._tag).toBe("AttestationError");

// Canonical serialization is deterministic
const a = { z: 1, a: 2 };
const b = { a: 2, z: 1 };
expect(canonicalize(a)).toEqual(canonicalize(b));

// Grant-to-ops mapping
const grant = { messaging: { send: true, reply: true, react: false, draftOnly: false }, ... };
const ops = grantConfigToOps(grant);
expect(ops).toContain("messaging:send");
expect(ops).toContain("messaging:reply");
expect(ops).not.toContain("messaging:react");
```

### Test Utilities

```typescript
/** Creates a mock AttestationSigner that signs with a test key. */
function createTestSigner(): AttestationSigner;

/** Creates a mock AttestationPublisher that records published attestations. */
function createTestPublisher(): AttestationPublisher & {
  readonly published: readonly SignedAttestation[];
};

/** Creates a fully configured SealManager with test deps. */
function createTestSealManager(): SealManager & {
  readonly signer: ReturnType<typeof createTestSigner>;
  readonly publisher: ReturnType<typeof createTestPublisher>;
};
```

## File Layout

```
packages/attestations/
  package.json
  tsconfig.json
  src/
    index.ts                    # Re-exports all public API
    attestation-id.ts           # generateAttestationId()
    materiality.ts              # MaterialFields, isMaterialChange()
    build.ts                    # AttestationInput, buildAttestation()
    canonicalize.ts             # canonicalize() deterministic serialization
    grant-ops.ts                # grantConfigToOps(), grantConfigToToolScopes()
    content-type.ts             # ATTESTATION_CONTENT_TYPE_ID, REVOCATION_CONTENT_TYPE_ID,
                                # SignedAttestationEnvelope, SignedRevocationEnvelope
    signer.ts                   # AttestationSigner interface
    publisher.ts                # AttestationPublisher interface
    manager.ts                  # SealManager, createSealManager()
    provenance.ts               # MessageProvenanceMetadata
    __tests__/
      attestation-id.test.ts
      materiality.test.ts
      build.test.ts
      canonicalize.test.ts
      grant-ops.test.ts
      content-type.test.ts
      manager.test.ts
      fixtures.ts               # Test utilities (createTestSigner, etc.)
```

Each source file targets under 150 LOC. The manager is the largest file; if it exceeds 200 LOC, split the revocation flow into `revocation.ts`.

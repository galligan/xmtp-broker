# Package API Reference

Per-package exports, dependencies, and extension points.

## Foundation Tier

### @xmtp-broker/schemas

The single source of truth for all types. Every type in the system is derived
from a Zod schema in this package.

**Exports:**
- Content types: `TextPayload`, `ReactionPayload`, `ReplyPayload`, `ReadReceiptPayload`, `GroupUpdatedPayload`, `BASELINE_CONTENT_TYPES`, `CONTENT_TYPE_SCHEMAS`
- Views: `ViewMode`, `ContentTypeAllowlist`, `ThreadScope`, `ViewConfig`
- Grants: `MessagingGrant`, `GroupManagementGrant`, `ToolScope`, `ToolGrant`, `EgressGrant`, `GrantConfig`
- Attestations: `InferenceMode`, `HostingMode`, `TrustTier`, `RevocationRules`, `AttestationSchema`
- Sessions: `SessionConfig`, `SessionToken`, `SessionState`
- Reveal: `RevealScope`, `RevealRequest`, `RevealGrant`, `RevealState`
- Revocation: `AgentRevocationReason`, `SessionRevocationReason`, `RevocationAttestation`
- Events: `MessageEvent`, `AttestationEvent`, `SessionStartedEvent`, `SessionExpiredEvent`, `BrokerEvent` (union), and others
- Requests: `SendMessageRequest`, `SendReactionRequest`, `UpdateViewRequest`, and others
- Responses: `RequestSuccess`, `RequestFailure`, `RequestResponse`
- Errors: `ErrorCategory`, `ErrorCategoryMeta`, `ERROR_CATEGORY_META`, `errorCategoryMeta`, `BrokerError` (union), `AnyBrokerError`, `matchError`, `ValidationError`, `AttestationError`, `NotFoundError`, `PermissionError`, `GrantDeniedError`, `AuthError`, `SessionExpiredError`, `InternalError`, `TimeoutError`, `CancelledError`

**Dependencies:** `zod`, `better-result`

**Extending:** Add new schemas here first. Export both the schema (for runtime validation) and the inferred type (for compile-time safety).

### @xmtp-broker/contracts

Service interfaces and wire format schemas that define boundaries between packages.

**Exports:**
- Core types: `CoreState`, `CoreContext`, `GroupInfo`, `RawMessage`, `RawEvent`
- Session types: `SessionRecord`, `MaterialityCheck`
- Policy types: `PolicyDelta`, `GrantError`
- Attestation types: `SignedAttestation`, `SignedAttestationEnvelope`, `SignedRevocationEnvelope`, `MessageProvenanceMetadata`
- Service interfaces: `BrokerCore`, `SessionManager`, `AttestationManager`
- Provider interfaces: `SignerProvider`, `AttestationSigner`, `AttestationPublisher`, `RevealStateStore`

**Dependencies:** `@xmtp-broker/schemas`

**Extending:** When a new service needs to be consumed across packages, define its interface here. Runtime packages implement these contracts.

## Runtime Tier

### @xmtp-broker/core

The XMTP client abstraction layer. Defines the `XmtpClient` interface for client lifecycle management. `@xmtp/node-sdk` integration is planned but not yet present as a dependency.

**Exports:**
- Config: `BrokerCoreConfigSchema`, `XmtpEnvSchema`, `IdentityModeSchema`
- Implementation: `BrokerCoreImpl`, `BrokerCoreContext`
- Identity: `SqliteIdentityStore`, `AgentIdentity`
- Registry: `ClientRegistry`, `ManagedClient`
- Events: `CoreEventEmitter`, `RawMessageEvent`, `RawGroupJoinedEvent`, etc.
- XMTP abstraction: `XmtpClient`, `XmtpClientFactory` (interfaces for testing)

**Dependencies:** `@xmtp-broker/contracts`, `@xmtp-broker/schemas`

**Extending:** To support new XMTP features, extend `XmtpClient` interface and update `BrokerCoreImpl`.

### @xmtp-broker/keys

Three-tier key hierarchy with encrypted vault.

**Exports:**
- Config: `KeyPolicySchema`, `PlatformCapabilitySchema`, `KeyManagerConfigSchema`
- Types: `RootKeyHandle`, `OperationalKey`, `SessionKey`
- Platform: `detectPlatform`, `platformToTrustTier`
- Manager: `createKeyManager` (central orchestrator)
- Vault: `createVault`
- Signers: `createSignerProvider`, `createAttestationSigner`
- Sub-managers: `createOperationalKeyManager`, `createSessionKeyManager`
- Root key: `initializeRootKey`
- Crypto: P-256/Ed25519 key gen, signing, verification, import/export

**Dependencies:** `@xmtp-broker/contracts`, `@xmtp-broker/schemas`

### @xmtp-broker/sessions

Session lifecycle and token management.

**Exports:**
- Token: `generateToken`, `generateSessionId`
- Policy: `computePolicyHash`
- Materiality: `checkMateriality`, `DetailedMaterialityCheck`
- Manager: `createSessionManager`, `SessionManagerConfig`

**Dependencies:** `@xmtp-broker/contracts`, `@xmtp-broker/schemas`

### @xmtp-broker/attestations

Attestation lifecycle — build, sign, encode, publish.

**Exports:**
- ID: `generateAttestationId`
- Serialization: `canonicalize`
- Content types: `ATTESTATION_CONTENT_TYPE_ID`, `REVOCATION_CONTENT_TYPE_ID`, encode/decode functions
- Grant mapping: `grantConfigToOps`, `grantConfigToToolScopes`
- Builder: `buildAttestation`, `AttestationInput`, `AttestationBuildResult`
- Delta: `computeInputDelta`
- Manager: `createAttestationManager`

**Dependencies:** `@xmtp-broker/contracts`, `@xmtp-broker/schemas`, `@xmtp-broker/policy`

### @xmtp-broker/policy

View projection pipeline and grant enforcement.

**Exports:**
- Pipeline: `projectMessage`, `isInScope`, `isContentTypeAllowed`, `resolveVisibility`, `projectContent`
- Allowlist: `resolveEffectiveAllowlist`, `validateViewMode`
- Grant validation: `validateSendMessage`, `validateSendReply`, `validateSendReaction`, `validateGroupManagement`, `validateToolUse`, `validateEgress`, `checkGroupInScope`
- Reveal state: `createRevealStateStore`
- Materiality: `isMaterialChange`, `requiresReauthorization`

**Dependencies:** `@xmtp-broker/contracts`, `@xmtp-broker/schemas`

**Extending:** Add new grant validators in `src/grant/`. Add new pipeline stages in `src/pipeline/`.

### @xmtp-broker/verifier

6-check verification service for broker trust anchoring.

**Exports:**
- Schemas: `CheckVerdict`, `VerificationCheck`, `VerificationRequestSchema`, `VerificationStatementSchema`, `VerifierSelfAttestationSchema`
- Config: `VerifierConfigSchema`, `DEFAULT_STATEMENT_TTL_SECONDS`
- Content types: `VERIFICATION_REQUEST_CONTENT_TYPE_ID`, `VERIFICATION_STATEMENT_CONTENT_TYPE_ID`
- Checks: source available, build provenance, release signing, attestation signature, attestation chain, schema compliance
- Service: `createVerifierService`
- Utilities: `createRateLimiter`, `canonicalizeStatement`

**Dependencies:** `@xmtp-broker/contracts`, `@xmtp-broker/schemas`

## Transport Tier

### @xmtp-broker/ws

WebSocket transport built on `Bun.serve()`.

**Exports:**
- Config: `WsServerConfigSchema`
- Close codes: `WS_CLOSE_CODES`
- Frames: `AuthFrame`, `AuthenticatedFrame`, `AuthErrorFrame`, `BackpressureFrame`, `SequencedFrame`, `InboundFrame`
- Connection: `createConnectionState`, `canTransition`, `transition` (state machine: connecting → authenticating → active → draining → closed)
- Registry: `ConnectionRegistry`
- Replay: `CircularBuffer` (for session resumption)
- Backpressure: `BackpressureTracker`
- Auth: `handleAuth`, `TokenLookup`
- Routing: `routeRequest`, `RequestHandler`
- Event broadcasting: `sequenceEvent`
- Server: `createWsServer`

**Dependencies:** `@xmtp-broker/contracts`, `@xmtp-broker/schemas`

**Extending:** Future transports (MCP, CLI, HTTP) follow this same pattern: parse protocol input → validate auth → route to handlers → format output.

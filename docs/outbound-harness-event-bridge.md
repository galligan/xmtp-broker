# Outbound Harness Event Bridge

Date: 2026-03-30
Status: Proposed

## Goal

Define the outbound model that lets agent harnesses become aware of XMTP-driven
activity and fire their own internal logic without forcing Signet to become a
webhook-first system.

The key design choice is:

- the canonical outbound source remains the Signet event stream
- a lightweight bridge adapts that stream to harness-native delivery modes
- webhooks are one adapter mode, not the root abstraction

This complements the new contract-driven HTTP action surface:

- HTTP actions solve ingress
- the event bridge solves egress

## Canonical Source

The canonical outbound source is the existing credential-scoped Signet event
stream carried over WebSocket frames with monotonic sequence numbers.

That source already matches the true runtime model:

- Signet is the real XMTP client
- Signet owns sync, decryption, policy, and projection
- harnesses should consume projected Signet events, not raw XMTP traffic

The bridge should consume the same sequenced event stream already used by
first-party Signet clients.

## Runners

### Primary Signet Runner

The primary runner is the stateful, trusted runtime.

Responsibilities:

- key custody
- encrypted state and XMTP sync
- credential issuance and revocation
- permission enforcement and content projection
- canonical event sequencing
- HTTP action ingress

The primary runner is the source of truth for replay and ordering.

### Harness Bridge Runner

The harness bridge is a lightweight sidecar or embedded adapter that sits near
the harness.

Responsibilities:

- authenticate to the primary Signet
- subscribe to the credential-scoped event stream
- persist replay checkpoints
- dedupe and re-emit events locally
- adapt canonical Signet events into harness-native delivery modes

The bridge should not own:

- raw XMTP keys
- encrypted Signet state
- MLS/session logic
- policy decisions

## Trust Boundaries

### Primary Signet trust boundary

The primary runner is trusted with:

- operational keys
- policy state
- event sequencing
- credential validation

### Bridge trust boundary

The bridge is trusted only with:

- short-lived auth material for a specific credential or operator scope
- local delivery configuration
- replay checkpoints

The bridge must be considered replaceable and restartable.

## Auth Posture

### Phase 1 posture

Use existing credential tokens to authenticate the bridge to the primary
Signet.

This keeps the first implementation simple:

- no new root auth system
- no duplicate token lifecycle on day one
- outbound bridge behavior stays aligned with existing scoped credentials

### Phase 2 posture

Add an optional exchange flow that mints a shorter-lived bridge session token
from a credential token.

That token should be bound to:

- `credentialId`
- allowed delivery modes
- issued-at / expiry
- optional bridge instance id

This is useful once bridge fleets, queues, or webhook fan-out need stronger
rotation and tighter blast-radius control.

### Webhook signing

Webhook signing keys should be bridge-local, not Signet-global.

Reason:

- webhook authenticity is an adapter concern
- different harnesses may need different signing secrets
- the primary Signet should not accumulate callback-target secrets unless it is
  explicitly acting as the webhook sender

## Replay And Dedupe

The bridge must treat replay as a first-class concern.

### Checkpoint model

Persist a checkpoint per credential stream:

```ts
interface BridgeCheckpoint {
  readonly credentialId: string;
  readonly lastSeenSeq: number;
  readonly updatedAt: string;
}
```

### Resume flow

1. Bridge connects with credential auth.
2. Bridge presents `lastSeenSeq` when available.
3. Primary Signet replays frames with `seq > lastSeenSeq`.
4. Bridge emits only unseen frames and advances the checkpoint after durable
   local acceptance.

### Dedupe rule

Use `(credentialId, seq)` as the canonical dedupe key.

That is stable across delivery modes and does not require event-payload hashing.

### Recovery behavior

If the primary Signet cannot satisfy replay from the requested sequence window,
it should fail loudly with a recovery-required response rather than silently
skipping ahead.

The bridge should then:

1. mark the stream as degraded
2. request a fresh attachment or resubscribe flow
3. resume normal delivery once Signet confirms recovery completion

## Delivery Modes

The bridge should support multiple delivery modes over the same canonical event
source.

### `emitter`

In-process callback or event-emitter delivery.

Best for:

- embedded harness runtimes
- local orchestration
- the lowest-latency path

### `sse`

Server-Sent Events stream exposed by the bridge.

Best for:

- browser-adjacent clients
- simple remote consumers
- lightweight observability tooling

### `webhook`

Signed HTTP POST delivery to configured callback targets.

Best for:

- existing webhook-shaped harnesses
- workflow engines that already expect callbacks

### `queue`

Publish canonical bridge envelopes to a queue or event bus.

Best for:

- durable orchestration
- fan-out
- asynchronous multi-worker processing

## Canonical Envelope

Bridge adapters should preserve the canonical sequencing envelope.

```ts
interface BridgeEnvelope<TEvent = unknown> {
  readonly credentialId: string;
  readonly seq: number;
  readonly occurredAt: string;
  readonly event: TEvent;
}
```

Adapter modes may wrap this envelope, but should not discard:

- `credentialId`
- `seq`
- event type
- occurrence time

## Contract-Level vs Bridge-Level Concerns

### Contract-level

These belong in Signet contracts and shared schemas:

- canonical event types
- sequenced frame shape
- replay semantics at the stream boundary
- credential-scoped auth requirements

### Bridge-level

These belong in bridge config and adapter code:

- callback URLs
- SSE endpoint configuration
- queue topic names
- webhook retry policy
- local checkpoint storage
- adapter-specific filtering or batching

## Implementation Shape

### Step 1

Define a small bridge runtime that consumes the existing Signet WebSocket event
stream and persists `lastSeenSeq`.

### Step 2

Implement an adapter interface:

```ts
interface BridgeAdapter {
  readonly mode: "emitter" | "sse" | "webhook" | "queue";
  deliver(envelope: BridgeEnvelope): Promise<void>;
}
```

### Step 3

Add bridge-local retry and dead-letter behavior for adapters that can fail
independently of the canonical stream.

### Step 4

Add an optional bridge-session-token exchange if the first release needs tighter
token scope than raw credential tokens provide.

## Recommended Follow-on Issues

1. Build a minimal bridge runner that wraps the existing Signet WebSocket
   transport and persists `lastSeenSeq`.
2. Add a bridge adapter package for in-process emitter delivery.
3. Add a webhook adapter with HMAC signing, retry, and delivery id headers.
4. Add an SSE adapter for browser/service consumers.
5. Add a queue adapter interface with one concrete backend.

## Decision

The canonical outbound model for Signet should remain websocket-first and
sequence-first.

The bridge is the compatibility layer.

That keeps Signet aligned with its real trust and state model while still
making it practical for webhook-oriented and non-webhook-oriented harnesses to
participate.

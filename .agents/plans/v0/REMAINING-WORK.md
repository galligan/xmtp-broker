# Remaining Work: Phase 1 Completion and Phase 2 Delivery

**Created:** 2026-03-17
**Context:** Phase 2C (Convos interop, conversation management, devnet connectivity) is complete across 38 stacked PRs. This document tracks what remains before the signet is feature-complete for Phase 1 (PRD) and ready for Phase 2 delivery to external developers.

**Note:** The rename from xmtp-broker to XMTP Signet is planned but not yet executed. See [RENAME-SIGNET.md](RENAME-SIGNET.md) for the full plan. This document uses "signet" for forward-looking items and "broker" where referring to current code.

## Current State

The broker runs on XMTP devnet with:
- Dual-identity registration and management
- Group creation, listing, info, add-member, members
- Convos invite generate/parse/verify/join roundtrip
- Session-scoped WebSocket with policy enforcement
- Vault-backed key hierarchy (root, operational, session)
- Reference verifier (trust chain, seal chain)
- CLI daemon with admin socket

Validated end-to-end via tracer bullet on devnet (17/17 steps, 3 bugs fixed).

---

## Pre-Merge: Rename to XMTP Signet

Execute as a single mechanical commit after the current stack merges to main. See [RENAME-SIGNET.md](RENAME-SIGNET.md) for the full terminology map and execution plan.

---

## Phase 1 Gaps (from PRD)

Items the PRD scopes to Phase 1 that are not yet complete.

### P1-1: Secure Enclave Key Binding

**What:** Upgrade `rootKeyPolicy` from `"open"` (software-only vault) to hardware-backed storage using macOS Secure Enclave (P-256) for the root key.

**Why:** The PRD's hard requirement: "Signing keys stored in hardware-backed storage where available (Secure Enclave, TEE)." Currently the root key is generated and stored in an encrypted vault file, but the encryption key itself is not hardware-bound.

**Scope:** `packages/keys/` — add a `SecureEnclaveRootKeyProvider` alongside the existing `SoftwareRootKeyProvider`. The key hierarchy stays the same (root -> operational -> session); only the root key storage changes.

**Effort:** Large. Requires Swift interop (Bun FFI or child process) for Secure Enclave access. Platform-specific (macOS/iOS only; Linux falls back to software vault).

---

### P1-2: Reveal-Only View Mode

**What:** Enforce `reveal-only` view mode in the policy engine. Currently all views are effectively `full` — the agent sees complete message content. In `reveal-only` mode, messages should be redacted by default with explicit per-message or per-thread reveal.

**Why:** The PRD lists "Support basic view modes (full, reveal-only)" as Phase 1. The schema defines view modes but the policy engine doesn't enforce anything beyond `full`.

**Scope:** `packages/policy/` — add content filtering in the view projection layer. When `mode: "reveal-only"`, messages are projected as placeholders unless explicitly revealed. Requires a reveal state store (which messages/threads have been revealed).

**Effort:** Medium. Schema already has the mode field. Policy engine needs a filter pass. Reveal state needs persistence (probably a table in the identity store DB).

---

### P1-3: Event Stream (Signet → Harness)

**What:** Implement canonical signet events and stream them to connected WebSocket clients.

**Why:** The PRD defines 15 event types. Currently the broker emits raw XMTP events internally but doesn't project them to harness clients. The WebSocket connection is request/response only — no server-initiated events. Without this, agents can't react to incoming messages.

**Events to implement (priority order):**
1. `message.visible` — new message in the agent's view scope
2. `session.expired` — session reached its `expiresAt`
3. `message.visible.historical` — backfill of messages from before the session started
4. `view.updated` — view scope changed (when editing is implemented)
5. `grant.updated` — grant scope changed
6. `seal.stamped` — new seal applied

**Scope:** `packages/ws/` for the WebSocket streaming, `packages/core/` for event projection through the policy engine (filter events by session view).

**Effort:** Medium-large. The raw event infrastructure exists (`streamAllMessages`, `streamGroups`). Needs: event type schemas, view-scoped filtering, WebSocket push frames, client SDK event handlers.

---

### P1-4: Heartbeat and Liveness

**What:** Implement heartbeat signals so clients can detect signet liveness. The seal includes a `heartbeatInterval` field; clients should be able to infer "agent unreachable" when the interval is exceeded.

**Why:** PRD section "Liveness and Graceful Degradation" — without heartbeats, a crashed signet is indistinguishable from an agent that chooses not to respond.

**Scope:** `packages/ws/` — periodic ping/pong or lightweight keepalive frames. `packages/sessions/` — heartbeat interval in session/seal metadata.

**Effort:** Small. WebSocket ping/pong is mostly built-in. The seal field already exists in the schema.

---

## Phase 2 Gaps (from PRD)

### P2-1: MCP Transport Wiring

**What:** Wire conversation ActionSpecs as MCP tools. Currently the MCP server exists with session-scoped tool infrastructure but conversation actions aren't exposed.

**Effort:** Small-medium.

### P2-2: Deployment Templates

**What:** Dockerfile, docker-compose.yml, Railway template for running the signet outside the source tree.

**Effort:** Small-medium.

### P2-3: Full Seal Signing

**What:** Replace seal signer/publisher stubs with real Ed25519 signing and XMTP message publishing.

**Effort:** Medium.

### P2-4: Build Provenance Verification

**What:** Real Sigstore/GitHub OIDC verification in the verifier (currently v0 stub).

**Effort:** Medium.

### P2-5: Session Permission Editing

**What:** Modify a session's view/grant without revoke + reissue.

**Effort:** Medium.

### P2-6: HTTP API Adapter

**What:** REST API for non-streaming operations.

**Effort:** Medium.

### P2-7: Action Confirmations

**What:** Confirmation flow for sensitive actions (tool calls, group management).

**Effort:** Medium-large.

---

## Suggested Execution Order

### Next: Rename to XMTP Signet

Single mechanical commit after the current stack merges. See RENAME-SIGNET.md.

### Then: Phase 1 Close-Out

| Order | Item | Effort | Rationale |
|-------|------|--------|-----------|
| 1 | P1-4: Heartbeat/Liveness | Small | Quick win, closes a PRD gap |
| 2 | P1-3: Event Stream | Medium-large | Unlocks real-time agent UX |
| 3 | P1-2: Reveal-Only View Mode | Medium | Core privacy feature |
| 4 | P2-1: MCP Transport Wiring | Small-medium | Enables agent framework integration |
| 5 | P2-3: Full Seal Signing | Medium | Makes trust chain real |
| 6 | P1-1: Secure Enclave | Large | Platform-specific, can ship without on Linux |

### Follow-On: Phase 2 Delivery

| Order | Item | Effort |
|-------|------|--------|
| 7 | P2-2: Deployment Templates | Small-medium |
| 8 | P2-4: Build Provenance | Medium |
| 9 | P2-5: Session Permission Editing | Medium |
| 10 | P2-6: HTTP API | Medium |
| 11 | P2-7: Action Confirmations | Medium-large |

# Remaining Work: Phase 1 Completion and Phase 2 Delivery

**Created:** 2026-03-17
**Context:** Phase 2C (Convos interop, conversation management, devnet connectivity) is complete across 38 stacked PRs. This document tracks what remains before the broker is feature-complete for Phase 1 (PRD) and ready for Phase 2 delivery to external developers.

## Current State

The broker runs on XMTP devnet with:
- Dual-identity registration and management
- Group creation, listing, info, add-member, members
- Convos invite generate/parse/verify/join roundtrip
- Session-scoped WebSocket with policy enforcement
- Vault-backed key hierarchy (root, operational, session)
- Reference verifier (trust chain, attestation chain)
- CLI daemon with admin socket

Validated end-to-end via tracer bullet on devnet (17/17 steps, 3 bugs fixed).

---

## Phase 1 Gaps (from PRD)

Items the PRD scopes to Phase 1 that are not yet complete.

### P1-1: Secure Enclave Key Binding

**What:** Upgrade `rootKeyPolicy` from `"open"` (software-only vault) to hardware-backed storage using macOS Secure Enclave (P-256) for the root key.

**Why:** The PRD's hard requirement: "Signing keys stored in hardware-backed storage where available (Secure Enclave, TEE)." Currently the root key is generated and stored in an encrypted vault file, but the encryption key itself is not hardware-bound.

**Scope:** `packages/keys/` — add a `SecureEnclaveRootKeyProvider` alongside the existing `SoftwareRootKeyProvider`. The key hierarchy stays the same (root -> operational -> session); only the root key storage changes.

**Reference:** `.reference/keypo-cli/` has the Swift Secure Enclave signer pattern. The broker should not take a runtime dependency on keypo-cli but can use it as a design reference.

**Effort:** Large. Requires Swift interop (Bun FFI or child process) for Secure Enclave access. Platform-specific (macOS/iOS only; Linux falls back to software vault).

---

### P1-2: Reveal-Only View Mode

**What:** Enforce `reveal-only` view mode in the policy engine. Currently all views are effectively `full` — the agent sees complete message content. In `reveal-only` mode, messages should be redacted by default with explicit per-message or per-thread reveal.

**Why:** The PRD lists "Support basic view modes (full, reveal-only)" as Phase 1. The schema defines view modes but the policy engine doesn't enforce anything beyond `full`.

**Scope:** `packages/policy/` — add content filtering in the view projection layer. When `mode: "reveal-only"`, messages are projected as placeholders unless explicitly revealed. Requires a reveal state store (which messages/threads have been revealed).

**Effort:** Medium. Schema already has the mode field. Policy engine needs a filter pass. Reveal state needs persistence (probably a table in the identity store DB).

---

### P1-3: Broker Event Stream

**What:** Implement the canonical broker events defined in the PRD and stream them to connected WebSocket clients.

**Why:** The PRD defines 15 event types. Currently the broker emits raw XMTP events internally but doesn't project them to harness clients. The WebSocket connection is request/response only — no server-initiated events.

**Events to implement (priority order):**
1. `message.visible` — new message in the agent's view scope
2. `session.expired` — session reached its `expiresAt`
3. `message.visible.historical` — backfill of messages from before the session started
4. `view.updated` — view scope changed (when editing is implemented)
5. `grant.updated` — grant scope changed
6. `attestation.updated` — new attestation published

**Scope:** `packages/ws/` for the WebSocket streaming, `packages/core/` for event projection through the policy engine (filter events by session view).

**Effort:** Medium-large. The raw event infrastructure exists (`streamAllMessages`, `streamGroups`). Needs: event type schemas, view-scoped filtering, WebSocket push frames, client SDK event handlers.

---

### P1-4: Heartbeat and Liveness

**What:** Implement heartbeat signals so clients can detect broker liveness. The attestation includes a `heartbeatInterval` field; clients should be able to infer "agent unreachable" when the interval is exceeded.

**Why:** PRD section "Liveness and Graceful Degradation" — without heartbeats, a crashed broker is indistinguishable from an agent that chooses not to respond.

**Scope:** `packages/ws/` — periodic ping/pong or lightweight keepalive frames. `packages/sessions/` — heartbeat interval in session/attestation metadata.

**Effort:** Small. WebSocket ping/pong is mostly built-in. The attestation field already exists in the schema.

---

## Phase 2 Gaps (from PRD)

Items the PRD scopes to Phase 2 that are not yet complete.

### P2-1: MCP Transport Wiring

**What:** Wire the conversation ActionSpecs (create, list, info, join, invite, add-member, members) as MCP tools in `packages/mcp/`. Currently the MCP server exists with session-scoped tool infrastructure but the conversation actions aren't exposed.

**Why:** MCP is a primary adapter in the PRD. Agent frameworks (Claude, etc.) connect via MCP. Without conversation tools in MCP, harnesses can only use WebSocket.

**Scope:** `packages/mcp/` — register each ActionSpec as an MCP tool with JSON Schema input/output derived from the Zod schemas (using `zod-to-json-schema`, already a blessed dep).

**Effort:** Small-medium. The plumbing exists; it's mostly registration and input/output mapping.

---

### P2-2: Deployment Templates

**What:** Provide deployment templates for running the broker outside of `bun run packages/cli/src/bin.ts`.

**Templates needed:**
1. **Dockerfile** — single-container local broker
2. **docker-compose.yml** — broker + optional verifier
3. **Railway template** — one-click deploy (Railway supports Bun natively)

**Why:** PRD Phase 2: "Add self-hosted deployment templates." Currently the only way to run the broker is from the source tree.

**Scope:** Root-level `deploy/` directory with Dockerfile, compose file, and Railway config. Probably also a `broker` binary entry point (a thin wrapper around the CLI).

**Effort:** Small-medium. The CLI already handles all configuration. Templates just need to package it.

---

### P2-3: Full Attestation Signing

**What:** Replace the attestation signer/publisher stubs in `packages/cli/src/start.ts` with real implementations. Attestations should be signed with the Ed25519 operational key and (optionally) published as XMTP messages to the group.

**Why:** PRD Phase 1 says "Define structured egress/inference disclosure fields" (done) but Phase 2 says "Add attestation timeline UX (material changes only)." The signing infrastructure exists (`@xmtp-broker/attestations` has content types, signing interfaces, materiality checking) but the production wiring is stubbed.

**Scope:**
- `packages/cli/src/start.ts` — replace `stubSigner` with real Ed25519 signing via the operational key
- `packages/cli/src/start.ts` — replace `stubPublisher` with XMTP message publishing (send attestation content type to the group)
- `packages/cli/src/start.ts` — replace `stubResolver` with real input resolution (read current session state)

**Effort:** Medium. The attestation package has the types and codecs. The signer needs the operational key (available via `SignerProvider`). The publisher needs the managed XMTP client.

---

### P2-4: Build Provenance Verification

**What:** Implement real build provenance checking in the verifier. Currently returns "v0 stub" skip result.

**Why:** PRD trust chain Layer 2: "Build Provenance — did this binary come from a known CI pipeline?" The verifier has the check scaffolding but doesn't actually verify GitHub Actions OIDC tokens or Sigstore bundles.

**Scope:** `packages/verifier/src/checks/build-provenance.ts` — parse and verify Sigstore bundles or GitHub Actions OIDC attestations.

**Effort:** Medium. Requires understanding Sigstore bundle format and GitHub OIDC token verification. Could use `sigstore-js` or implement minimal verification.

---

### P2-5: Session Permission Editing

**What:** Allow modifying a session's view and grant after issuance without revoking and reissuing.

**Why:** PRD Phase 2: "Add permission editing UX." Currently the only way to change permissions is revoke + reissue, which breaks the WebSocket connection and requires the harness to reconnect.

**Scope:** `packages/sessions/` — add `updateView()` and `updateGrant()` methods. `packages/ws/` — push `view.updated` / `grant.updated` events to the connected client. `packages/cli/` — `session update` command.

**Effort:** Medium. Session store needs update methods. Policy engine needs to reload scopes mid-connection.

---

### P2-6: HTTP API Adapter

**What:** A lightweight REST API for non-streaming operations (session management, conversation management, status). Complements WebSocket (streaming) and MCP (tool-oriented).

**Why:** PRD lists HTTP API as an additional adapter. Useful for dashboards, monitoring, and simple integrations that don't need real-time streaming.

**Scope:** `packages/http/` or add routes to the existing `Bun.serve()` in the daemon. RESTful endpoints mapping to existing ActionSpecs.

**Effort:** Medium. The handler contract is transport-agnostic, so this is mostly routing and serialization.

---

### P2-7: Action Confirmations

**What:** For sensitive actions (tool calls, group management), require explicit confirmation from the user before the broker executes them.

**Why:** PRD Phase 2: "Add action confirmations and richer tool scopes." The grant has a `tools.scopes` field but no confirmation flow.

**Scope:** `packages/ws/` — confirmation request/response frame types. `packages/core/` — action confirmation middleware in the handler pipeline. `packages/cli/` — CLI rendering of pending confirmations.

**Effort:** Medium-large. New frame types, state machine for pending confirmations, timeout handling.

---

## Suggested Execution Order

### Next Phase: "Phase 1 Close-Out"

Focus on completing the PRD Phase 1 scope. These are the items that make the broker a credible local-first security boundary.

| Order | Item | Effort | Rationale |
|-------|------|--------|-----------|
| 1 | P1-4: Heartbeat/Liveness | Small | Quick win, closes a PRD gap |
| 2 | P1-3: Broker Event Stream | Medium-large | Unlocks real-time agent UX — without this, agents can't react to incoming messages |
| 3 | P1-2: Reveal-Only View Mode | Medium | Core privacy feature, differentiates from "just a proxy" |
| 4 | P2-1: MCP Transport Wiring | Small-medium | Enables agent framework integration |
| 5 | P2-3: Full Attestation Signing | Medium | Makes trust chain real, not stubbed |
| 6 | P1-1: Secure Enclave | Large | Important but platform-specific; can ship without it on Linux |

### Follow-On: "Phase 2 Delivery"

| Order | Item | Effort | Rationale |
|-------|------|--------|-----------|
| 7 | P2-2: Deployment Templates | Small-medium | Gets the broker into others' hands |
| 8 | P2-4: Build Provenance | Medium | Completes the trust chain |
| 9 | P2-5: Session Permission Editing | Medium | UX improvement, not blocking |
| 10 | P2-6: HTTP API | Medium | Nice-to-have adapter |
| 11 | P2-7: Action Confirmations | Medium-large | Advanced grant feature |

# Core Concepts

This document describes the current conceptual model behind xmtp-signet. For
package boundaries and handler details, see [architecture.md](architecture.md).

> [!NOTE]
> The runtime is v1. Public workflows are described directly in terms of
> credentials, policies, and seals.

## Signet

The **signet** is the trusted runtime boundary that owns the real XMTP client.

It is responsible for:

- holding signer material and encrypted local state
- maintaining XMTP installation continuity
- syncing and projecting conversation state
- authenticating harnesses through credentials
- enforcing permission scopes before any harness action executes
- publishing seals that disclose what an operator can do

The signet is infrastructure, not a group participant. From XMTP's point of
view, each operator inbox is the participant; the signet manages that inbox and
its MLS state behind the scenes.

## Roles: owner, admin, operator

The v1 hierarchy is:

```text
Owner -> Admin -> Operator -> Credential -> Seal
```

### Owner

The human trust anchor. The owner bootstraps the signet, controls the root
boundary, and approves privileged operations.

### Admin

The management plane. Admins create operators, issue credentials, inspect
state, and handle orchestration workflows.

### Operator

A purpose-built agent profile. Operators do the conversational work, but they
only act through the credentials currently issued to them.

Operators can run in one of two scope modes:

- **per-chat**: each chat gets isolated inbox state
- **shared**: one operator context spans multiple chats

## Policy

A **policy** is a reusable permission bundle expressed as allow and deny scope
sets.

Policies answer the question: "what kinds of actions should this operator be
able to perform in principle?" A credential can reference a policy and still
apply inline overrides for a specific issuance.

Permissions are grouped into categories such as:

- messaging
- group management
- metadata
- access
- observation
- egress

The signet resolves the effective permission set with deny-wins semantics.

## Credential

A **credential** is the time-bound, chat-scoped authorization issued to an
operator.

A credential binds together:

- the target operator
- the chat or chats it covers
- a policy reference plus any inline allow/deny overrides
- issuance and expiry timestamps
- status such as `pending`, `active`, `expired`, or `revoked`

This replaces the older v0 session concept. The CLI exposes that lifecycle
directly through `xs credential issue`, `xs credential list`, and related
commands.

## Seal

A **seal** is the public trust surface. It is the signed declaration that tells
chat participants what an operator can do in that chat.

Seals communicate:

- which operator is acting
- which credential scope is active
- what permissions are allowed or denied
- how isolated the operator is
- whether anything material has changed since the previous seal

In the v1 design, seals are credential scoped and chain over time so clients
can see when permissions change.

## Projection and reveals

Harnesses never receive raw XMTP traffic. Messages pass through the signet's
projection pipeline before they are emitted over WebSocket, MCP, or the SDK.

At a high level the signet checks:

1. Is the conversation in the credential's allowed chat scope?
2. Is the relevant capability present in the effective permission set?
3. Does reveal state permit hidden or historical content to be surfaced?
4. If yes, emit the projected event; otherwise keep it inside the signet.

**Reveals** are the explicit mechanism for exposing content that would
otherwise stay hidden. Reveal state is credential scoped, not ambient.

## Admin auth vs credential auth

The signet uses two distinct authentication domains:

- **Admin auth** for management operations such as starting the daemon,
  exporting state, or auditing key integrity
- **Credential auth** for harness traffic and operator actions

This keeps administrative control separate from conversational authority.

## Resource IDs

Most local resources use short prefixed IDs such as:

- `op_<16hex>`
- `cred_<16hex>`
- `conv_<16hex>`
- `policy_<16hex>`
- `seal_<16hex>`

The short hex portion can be resolved when unique, but the canonical form is
the prefixed full ID.

## Trust model

The signet does not make an operator magically trustworthy. What it does is
make the operator's scope auditable and enforceable.

That gives other participants stronger answers to questions like:

- Which agent is acting here?
- What is it allowed to do?
- Is it isolated to this chat?
- Has its permission set changed since earlier messages?

That shift from opaque trust to inspectable trust is the core reason the
signet exists.

# Admin Read-Elevation Boundary

Date: 2026-04-13
Issue: #296

## What the code does today

The current runtime already enforces credential-scoped message reads for
harness callers, but admin callers still bypass those checks.

### Where the bypass used to happen

- `packages/core/src/message-actions.ts`
  - `message.list`
  - `message.info`
- Earlier in the day, both handlers only enforced read scope when
  `ctx.credentialId` was present.
- That bypass is now closed: plain `adminAuth` reads return `permission`
  unless an explicit `adminReadElevation` is attached to the request context.

### Why that is happening

Admin transports build a `HandlerContext` with `adminAuth`, not with a
credential:

- `packages/cli/src/admin/server.ts`
  - `makeHandlerContext()` sets `adminAuth`
- `packages/cli/src/http/server.ts`
  - `makeHandlerContext()` sets `adminAuth` for admin routes

That original behavior was exactly the gap described in `#296`.

## What should stay true

- Admin management access and message-read access must remain separate.
- Plain `adminAuth` must not become an ambient read grant.
- The existing credential-scoped path for harness callers should remain intact.
- The new elevation model should be explicit, time-bound, auditable, and easy to
  reason about in handler code.

## Minimal model change

The cleanest next step looks like a second, explicit context concept for
message-read elevation instead of overloading `adminAuth`.

Working shape:

- keep `adminAuth` as the management-plane signal
- add a separate read-elevation context, something like:
  - approved by owner
  - scoped to one or more chats or inboxes
  - bounded by expiry
  - carries an approval ID for audit and seal disclosure

Then `message.list` and `message.info` can require one of:

- credential scope with `read-messages`
- owner-approved read-elevation context

Everything else remains on the ordinary admin path unless we explicitly decide
otherwise.

## Why not synthesize a fake credential

A synthetic admin credential would blur the distinction between:

- operator-facing conversational authority
- owner-approved management elevation

That would make audit trails and later seal disclosure harder to interpret.
Keeping elevation as its own concept should preserve the security story more
cleanly.

## Immediate next step
The exact elevation object is now real in code:

- `packages/schemas/src/admin-read-elevation.ts`
  - `AdminReadElevationScope`
  - `AdminReadElevation`
- `packages/contracts/src/handler-types.ts`
  - `HandlerContext.adminReadElevation`
- `packages/core/src/message-actions.ts`
  - `message.list` and `message.info` now honor the explicit elevation context
    when it is present

This first slice intentionally does **not** yet mint, persist, inject, or audit
those elevations. It defines the stable boundary that the approval flow can
consume next.

## Current runtime shape

There is now also a first real approval lifecycle across the admin transports:

- `xs msg list --dangerously-allow-message-read ...`
- `xs msg info --dangerously-allow-message-read ...`
- HTTP admin routes with `dangerouslyAllowMessageRead: true`

When that flag is present, the daemon can:

- prompt the configured `adminReadElevation` biometric gate
- mint a short-lived, chat-scoped `adminReadElevation` object
- cache and reuse that elevation within the same authenticated admin session
  while it remains unexpired
- attach it to the handler context for the approved request
- append audit entries for approval, denial, reuse, and expiry

This is useful because it proves the `#296` boundary can be consumed by a real
runtime path instead of staying purely theoretical.

It also means the current default is finally honest:

- credential caller: scoped and fail-closed
- admin caller without elevation: permission denied
- admin caller with session-scoped elevation: allowed inside the approved chat

## What is still deferred

- approval request action shape
- pending elevation request storage
- any elevation persistence beyond the in-memory session and TTL window
- any cross-restart approval lifecycle

## What landed in the latest hardening pass

The current slice now also closes the disclosure gap for the local v1 runtime:

- active admin read elevation is tracked in a shared in-memory disclosure store
- the current seal for the affected chat is refreshed when elevation is
  approved
- the seal is refreshed again when the elevation expires
- seal input now reflects active `adminAccess` state during issue and refresh
- the public disclosure is intentionally root-admin scoped for now, surfaced as
  `adminAccess.operatorId: "owner"`

That leaves `#297` with a much narrower remaining tail:

- any explicit approval-request queue or stored request object
- any persistence beyond the in-memory runtime and TTL window
- any future shift from root-admin disclosure to a richer per-admin subject
  model

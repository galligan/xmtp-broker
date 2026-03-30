# Architecture

## Package tiers

Dependencies flow downward only. No package may import from a higher tier.

```
┌─────────────────────────────────────────────────┐
│                    Client                        │
│                      sdk                         │
├─────────────────────────────────────────────────┤
│                   Transport                      │
│           ws · mcp · cli · http                  │
├─────────────────────────────────────────────────┤
│                    Runtime                       │
│    core · keys · sessions · seals · policy       │
│                   verifier                       │
├─────────────────────────────────────────────────┤
│                   Foundation                     │
│              schemas · contracts                  │
├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤
│              integration (test-only)             │
└─────────────────────────────────────────────────┘
```

**Foundation** — Stable types and contracts. Changes here ripple everywhere, so
they change slowly and deliberately. `schemas` defines all Zod schemas and
inferred types (including action result and pagination schemas). `contracts`
defines service interfaces, provider interfaces, the `ActionSpec` /
`ActionRegistry` system, derivation and validation helpers, surface maps,
`HandlerContext`, and the `ActionResult` envelope.

**Runtime** — Core signet functionality. Each package has a focused
responsibility. `core` is the only package that touches the XMTP SDK (now wired
via `createSdkClientFactory`). `policy` handles filtering and scope
enforcement. `keys` manages the cryptographic hierarchy plus admin keys and
JWT. `sessions` tracks credential authorization state. `seals` manages the
lifecycle of group-visible permission declarations. `verifier` provides the
6-check trust verification service.

**Transport** — Protocol adapters. `ws` is the WebSocket transport (Bun.serve)
with replay sequencing and backpressure tracking. `mcp`
converts ActionSpecs to MCP tools with credential-scoped auth. `cli` is the
composition root with 8 command groups, daemon lifecycle, admin Unix socket
(JSON-RPC 2.0), contract-driven HTTP admin/action routes, and direct mode
fallback.

**Client** — `sdk` (`@xmtp/signet-sdk`) is the harness-facing SDK. WebSocket client with typed
events, Result-based requests, automatic reconnection, exponential backoff.

**Test** — `integration` is test-only. 7 suites validating cross-package
composition.

## Data flow

### Harness → Signet (request)

```
Harness                          Signet
  │                                │
  ├─ WebSocket frame ────────────► │
  │                                ├─ Parse frame (Zod at boundary)
  │                                ├─ Validate credential token (sessions)
  │                                ├─ Check effective scopes (policy)
  │                                ├─ Execute handler (runtime)
  │                                ├─ Return Result<T, E>
  │  ◄──────────── Response frame ─┤
```

### XMTP → Signet → Harness (event)

```
XMTP Network                     Signet                          Harness
  │                                │                                │
  ├─ Raw message ────────────────► │                                │
  │                                ├─ Decode message (core)         │
  │                                ├─ Projection pipeline (policy)  │
  │                                ├─ Sequence event (ws)           │
  │                                ├─ Event frame ────────────────► │
```

## Key design decisions

**Schema-first types.** Zod schemas in `schemas` are the single source of truth.
TypeScript types are always derived via `z.infer<>`. This eliminates
type/runtime drift and means validation is baked into the type system.

**Result types everywhere.** Handlers return `Result<T, E>` from `better-result`.
No exceptions in domain code. This makes failure explicit in signatures, enables
typed error handling, and keeps the handler contract clean.

**Transport-agnostic handlers.** Domain logic knows nothing about WebSocket,
HTTP, or CLI. This means adding a new transport requires zero changes to
existing handlers — just a new adapter that maps protocol frames to handler
calls and Result values back to protocol responses.

**Authored contracts with derived surfaces.** `ActionSpec` bundles handler,
input schema, optional output/examples, and authored semantics such as
`description`, `intent`, and `idempotent`. The `ActionRegistry` collects specs;
CLI/admin RPC, MCP, and HTTP derive their native shapes from those authored
contracts. Validation catches route/annotation conflicts early, and the
surface-map hash makes drift visible in tests and review.

**Projection as pipeline.** Message filtering is a composable pipeline of
independent stages (chat scope → content-type → visibility → content projection).
Each stage can reject. New filtering logic is a new stage, not a modification
to an existing one.

**Dependency inversion via contracts.** Runtime packages depend on `contracts`
interfaces, not on each other directly. This keeps the dependency graph shallow
and makes packages independently testable.

## Blessed dependencies

| Concern           | Package                     |
| ----------------- | --------------------------- |
| Result type       | `better-result`             |
| Schema validation | `zod`                       |
| Testing           | `bun:test`                  |
| XMTP SDK          | `@xmtp/node-sdk`           |
| CLI framework     | `commander`                 |
| TOML parsing      | `smol-toml`                 |
| MCP SDK           | `@modelcontextprotocol/sdk` |
| Schema to JSON    | `zod-to-json-schema`        |

Prefer Bun-native APIs (`Bun.hash()`, `bun:sqlite`, `Bun.serve()`) over npm
packages. Adding a new dependency requires checking this list first and
discussing if the concern isn't covered.

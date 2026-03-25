# xmtp-signet

Agent signet for XMTP. The signet is the real XMTP client: it owns the signer,
encrypted storage, message sync, and transport surfaces. Agent harnesses never
touch raw credentials, raw databases, or the XMTP SDK directly. They connect
through a controlled interface with scoped credentials, policy-based permission
sets, and public seals that disclose what an agent can do.

> [!NOTE]
> The current local stack implements the v1 credential and seal model. The
> runtime and public interfaces are operator/policy/credential/seal based.

## Why a signet?

Without a signet, an XMTP agent is usually a full client: it holds wallet
material, stores the encrypted database, and can read or send anything the raw
SDK allows. Any "read-only" or "limited" permissions are advisory because the
harness already has the keys.

The signet makes those limits real:

- The **signet** owns the XMTP client, signer material, and encrypted state.
- The **harness** only receives the conversations, actions, and tools its
  active credential allows.
- **Seals** published into chats make the agent's scope and permissions visible
  to other participants.

This moves agents from opaque trust to inspectable trust.

## Core concepts

| Concept                      | What it is                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------- |
| **Signet**                   | Trusted runtime boundary that owns the real XMTP client and key material         |
| **Owner / Admin / Operator** | Role hierarchy for who approves, manages, and acts                               |
| **Policy**                   | Reusable permission bundle with allow/deny scopes                                |
| **Credential**               | Time-bound, chat-scoped authorization issued to an operator                      |
| **Seal**                     | Signed, group-visible declaration of an operator's current permissions and scope |

See [docs/concepts.md](docs/concepts.md) for the full model.

## Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│                         Transport                            │
│             WebSocket · MCP · CLI / HTTP admin API          │
├──────────────────────────────────────────────────────────────┤
│                          Runtime                             │
│    Core · Keys · Sessions · Seals · Policy · Verifier       │
├──────────────────────────────────────────────────────────────┤
│                         Foundation                           │
│                    Schemas · Contracts                       │
└──────────────────────────────────────────────────────────────┘
```

Dependencies flow downward only. Domain logic is transport agnostic: handlers
receive typed input and return `Result<T, E>`, never throw.

See [docs/architecture.md](docs/architecture.md) for the runtime and transport
details.

## Packages

| Package                    | Layer      | Purpose                                                                            |
| -------------------------- | ---------- | ---------------------------------------------------------------------------------- |
| `@xmtp/signet-schemas`     | Foundation | Zod schemas, inferred types, resource IDs, permission scopes, error taxonomy       |
| `@xmtp/signet-contracts`   | Foundation | Service interfaces, handler contract, action registry, wire formats                |
| `@xmtp/signet-core`        | Runtime    | XMTP client lifecycle, identity store, conversation and message streaming          |
| `@xmtp/signet-keys`        | Runtime    | Local key backend, encrypted vault, admin auth, operational key rotation           |
| `@xmtp/signet-sessions`    | Runtime    | Credential lifecycle, reveal state, and pending actions                            |
| `@xmtp/signet-seals`       | Runtime    | Seal issuance, chaining, signing, and revocation                                   |
| `@xmtp/signet-policy`      | Runtime    | Effective scope resolution, projection, reveal enforcement, materiality checks     |
| `@xmtp/signet-verifier`    | Runtime    | Multi-check verification pipeline for signet trust                                 |
| `@xmtp/signet-ws`          | Transport  | Primary harness-facing WebSocket transport                                         |
| `@xmtp/signet-mcp`         | Transport  | MCP transport for credential-scoped tool access                                    |
| `@xmtp/signet-sdk`         | Client     | TypeScript harness SDK with typed events and requests                              |
| `@xmtp/signet-cli`         | Transport  | `xs` CLI, daemon lifecycle, admin socket, HTTP admin API                           |
| `@xmtp/signet-integration` | Test       | Cross-package integration tests and fixtures                                       |

## Quick start

**Requirements:** [Bun](https://bun.sh) 1.2.9+

```bash
# Clone and bootstrap
git clone https://github.com/xmtp/xmtp-signet.git
cd xmtp-signet
bun run bootstrap

# Build and verify
bun run build
bun run check
```

### Run the signet

```bash
# Create a local XMTP identity and key hierarchy
xs identity init --env dev --label owner

# Start the daemon
xs start

# Inspect live state
xs status --json

# Create a conversation
xs conversation create

# Issue a credential for an operator
xs credential issue --operator op_a7f3 --credential @credential.json

# Inspect that credential
xs credential inspect cred_b2c1
```

`xs credential ...` is the canonical v1 lifecycle surface. Credential metadata
includes the scoped conversations and effective allow/deny sets directly.

See [docs/development.md](docs/development.md) for the development workflow and
package layout.

## CLI commands

The current CLI exposes these top-level groups:

| Group          | Commands                                                            |
| -------------- | ------------------------------------------------------------------- |
| `start`        | Start the signet daemon                                             |
| `stop`         | Stop the signet daemon                                              |
| `status`       | Show signet daemon status                                           |
| `config`       | `show`, `validate`                                                  |
| `identity`     | `init`, `list`, `info`, `rotate-keys`, `export-public`              |
| `credential`   | `issue`, `list`, `inspect`, `revoke`                                |
| `seal`         | `inspect`, `verify`, `history`                                      |
| `message`      | `send`, `list`, `stream`                                            |
| `conversation` | `create`, `list`, `info`, `add-member`, `invite`, `join`, `members` |
| `admin`        | `token`, `verify-keys`, `export-state`, `audit-log`                 |
| `keys`         | `rotate`                                                            |

## What's working

- 13-package workspace with cross-package tests and a local PR stack
- Resource IDs and network mapping with prefixed local IDs
- Operator, policy, credential, and seal runtime model
- Permission scopes with allow/deny resolution
- CLI daemon with admin socket and WebSocket transport
- Real XMTP connectivity, group creation, invites, and membership management
- Credential-scoped reveal flows and event projection
- Seal lifecycle with chaining, verification, and automatic refresh
- MCP transport with scoped read/reveal surfaces
- TypeScript harness SDK and end-to-end tracer bullets on XMTP devnet

## Design docs

- Product requirements: [.agents/docs/init/xmtp-signet.md](.agents/docs/init/xmtp-signet.md)
- v1 architecture plan: [.agents/plans/v1/v1-architecture.md](.agents/plans/v1/v1-architecture.md)
- OWS/key backend plan: [.agents/plans/v1/ows-integration.md](.agents/plans/v1/ows-integration.md)

## Contributing

This project uses:

- **Bun** as the runtime and package manager
- **TypeScript** in strict mode with maximum safety
- **Exported API doc coverage** enforced by `bun run docs:check`
- **TDD**: write the test before the code
- **Result types**: functions that can fail return `Result<T, E>`, not exceptions
- **Conventional commits**: `feat(scope):`, `fix(scope):`, `test(scope):`
- **Stacked PRs** via [Graphite](https://graphite.dev)

See [docs/development.md](docs/development.md), [CLAUDE.md](CLAUDE.md), and
[AGENTS.md](AGENTS.md) for repo-specific workflow guidance.

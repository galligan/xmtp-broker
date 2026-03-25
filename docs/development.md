# Development Guide

## Requirements

- [Bun](https://bun.sh) 1.2.9+
- Node.js 20+ for some tooling
- macOS, Linux, or WSL
- Xcode Command Line Tools on macOS for Secure Enclave support

## Setup

```bash
git clone https://github.com/xmtp/xmtp-signet.git
cd xmtp-signet
bun run bootstrap
```

Bootstrap installs workspace dependencies, repo hooks, and local CLI tools.

## Project structure

```text
xmtp-signet/
├── packages/
│   ├── schemas/          # Zod schemas, types, error taxonomy
│   ├── contracts/        # Service interfaces, handler contract, action specs
│   ├── core/             # XMTP client lifecycle and SDK integration
│   ├── keys/             # Key backend, vault, admin auth, rotation
│   ├── sessions/         # Credential lifecycle, reveal state, pending actions
│   ├── seals/            # Seal lifecycle and provenance
│   ├── policy/           # Scope resolution, projection, materiality
│   ├── verifier/         # Verification pipeline
│   ├── ws/               # WebSocket transport
│   ├── mcp/              # MCP transport
│   ├── cli/              # CLI entry point, daemon, admin socket, HTTP admin API
│   ├── sdk/              # Harness client SDK
│   └── integration/      # Cross-package integration tests
├── signet-signer/        # Swift CLI for Secure Enclave support (macOS)
├── scripts/              # Bootstrap and repo utilities
├── docs/                 # Public documentation
├── .agents/              # Plans, PRDs, notes
└── .claude/              # Local skills and agent guidance
```

Each package follows the same layout:

```text
packages/<name>/
├── src/
│   ├── index.ts
│   ├── *.ts
│   └── __tests__/
│       └── *.test.ts
├── package.json
└── tsconfig.json
```

## Current terminology

The runtime model is v1:

- operator
- policy
- credential
- seal
- permission scopes

## Commands

### Build and verify

```bash
bun run build
bun run test
bun run typecheck
bun run lint
bun run docs:check
bun run check
```

### Single package

```bash
cd packages/<name>
bun test
bun run build
bun run typecheck
bun run lint
```

### CLI

After bootstrap, the local CLI is available as `xs`:

```bash
xs --help
xs start
xs status --json
xs credential issue --operator op_a7f3 --credential @credential.json
xs credential inspect cred_b2c1
```

If you want to run the entrypoint directly from the repo:

```bash
bun packages/cli/src/bin.ts --help
```

## Documentation lookup

Use these tools before guessing:

```bash
# XMTP SDK and protocol docs
blz query -s xmtp "your query" --limit 5 --text

# Repo-local docs and plans
qmd query "your query" -c xmtp-signet
qmd query "your query" -c xmtp-signet-plans
qmd query "your query" -c xmtp-signet-claude
```

If you change docs or skills, refresh the local index:

```bash
qmd update
qmd embed
```

## Code conventions

### TypeScript

Strict mode with maximum safety:

```jsonc
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "verbatimModuleSyntax": true,
  "isolatedDeclarations": true,
}
```

Defaults:

- no `any`
- avoid `as` casts unless there is no better narrowing path
- ESM only
- derive types from Zod with `z.infer<>`

### Result types

Functions that can fail return `Result<T, E>` from `better-result`:

```typescript
import { err, ok, type Result } from "better-result";

function parseConfig(raw: unknown): Result<Config, ValidationError> {
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return err(ValidationError.create("config", "Invalid config"));
  }
  return ok(parsed.data);
}
```

Do not throw for normal operational failures inside handlers.

### Schema first

Zod schemas are the source of truth:

```typescript
import { z } from "zod";

const CredentialInput = z.object({
  operatorId: z.string(),
  chatIds: z.array(z.string()),
});

type CredentialInput = z.infer<typeof CredentialInput>;
```

### File size

- under 200 LOC: healthy
- 200-400 LOC: look for seams
- over 400 LOC: refactor before extending

## Testing

### TDD workflow

1. Red: write a failing test
2. Green: make it pass
3. Refactor: improve without breaking behavior

```bash
cd packages/<name>
bun test --watch
```

### Test location

Tests live alongside code in `src/__tests__/`.

```typescript
import { describe, expect, it } from "bun:test";

describe("credential issuance", () => {
  it("returns a typed credential record", async () => {
    expect(true).toBe(true);
  });
});
```

### Boundary validation

Parse external data at the edge with Zod. Internals should operate on typed,
trusted values.

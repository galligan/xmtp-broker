# Schema-First Architecture

Extracted from `outfitter/stack` as reference for xmtp-signet's type and validation strategy.

## Core Idea

Schemas are the single source of truth. A Zod schema defines the shape of data once, and everything else derives from it:

- **TypeScript types** — inferred via `z.infer<typeof Schema>`
- **Runtime validation** — `Schema.parse(input)` at boundaries
- **CLI arg parsing** — Zod schema validates parsed CLI options
- **MCP tool definitions** — `zodToJsonSchema(schema)` auto-generates JSON Schema for MCP protocol
- **Documentation** — schema descriptions flow into help text and tool listings

No manual type duplication. No type/validation drift.

## How It Works in Practice

### 1. Define the schema once

```typescript
// In a shared contracts/schemas location
const GetNoteInput = z.object({
  id: z.string().describe("Note ID"),
  workspace: z.string().describe("Workspace root path"),
});

type GetNoteInput = z.infer<typeof GetNoteInput>;
```

### 2. Handler receives typed, validated input

```typescript
const getNoteHandler: Handler<GetNoteInput, Note, NotFoundError> = async (input, ctx) => {
  // input is already validated and typed — no need to check fields
  const note = await loadNote(input.id, input.workspace);
  if (!note) return Result.err(NotFoundError.create("note", input.id));
  return Result.ok(note);
};
```

### 3. CLI adapter parses args against schema

```typescript
command("note:get")
  .input(GetNoteInput)                    // Zod schema drives validation
  .option("--id <id>", "Note ID")
  .option("--workspace <path>", "Root")
  .action(getNoteHandler)
  .build();
```

### 4. MCP adapter derives JSON Schema

```typescript
registerTool({
  name: "notes/get",
  inputSchema: GetNoteInput,              // zodToJsonSchema() called internally
  handler: getNoteHandler,
});
```

The MCP protocol receives a JSON Schema representation of the Zod schema, which LLM clients use to construct valid tool calls.

## Content Type Allowlists

In outfitter/stack, schemas also drive content type handling. Content type registries use schemas to validate message payloads.

This pattern maps directly to the broker's **content type allowlist** concept:

```typescript
// Each content type has a schema
const TextContentSchema = z.object({ text: z.string() });
const ReactionContentSchema = z.object({ reference: z.string(), action: z.enum(["added", "removed"]), content: z.string() });

// The view's allowlist references content type IDs
// The broker validates incoming content against the schema before projecting to the agent
```

## Seal Schema

The broker's seal model is a natural fit for schema-first design:

```typescript
const AttestationSchema = z.object({
  attestationId: z.string(),
  previousAttestationId: z.string().nullable(),
  agentInboxId: z.string(),
  ownerInboxId: z.string(),
  groupId: z.string(),
  viewMode: z.enum(["full", "thread-only", "redacted", "reveal-only"]),
  contentTypes: z.array(z.string()),
  grantedOps: z.array(z.string()),
  inferenceMode: z.enum(["local", "external", "hybrid", "unknown"]),
  inferenceProviders: z.array(z.string()),
  contentEgressScope: z.enum(["full-messages", "summaries-only", "tool-calls-only", "none", "unknown"]),
  retentionAtProvider: z.enum(["none", "session", "persistent", "unknown"]),
  hostingMode: z.enum(["local", "self-hosted", "managed"]),
  trustTier: z.enum(["unverified", "source-verified", "reproducibly-verified", "runtime-attested"]),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  // ...
});

type Attestation = z.infer<typeof AttestationSchema>;
```

This schema:
- Validates seals at the broker boundary
- Types all internal seal handling
- Auto-generates JSON Schema for MCP tool definitions
- Self-documents the seal format
- Can be versioned as the seal spec evolves

## Adaptation Notes for xmtp-signet

**Adopt from day one:**
- Zod as the schema library (lightweight, composable, excellent TS inference)
- Schema-first for all broker domain types: views, grants, seals, sessions, events
- `z.infer<>` for all TypeScript types — no manual interfaces
- Validate at boundaries (incoming harness requests, config, env vars), trust types internally
- `zodToJsonSchema()` when MCP transport is added later

**Key schemas to define early:**
- `ViewSchema` — view mode, content type allowlist, thread scope
- `GrantSchema` — messaging caps, group management caps, tool caps, egress caps
- `SealSchema` — full seal structure
- `SessionSchema` — session config, expiry, binding
- `BrokerEventSchema` — union of all canonical event types
- `HarnessRequestSchema` — union of all harness -> broker requests

**Why this matters for xmtp-signet specifically:**
- The seal format will eventually become a XIP — having it schema-defined from day one means the spec is always in sync with the code
- Multiple transports (WebSocket, MCP, CLI) will all need the same validation — one schema serves all
- Agent harnesses in different languages can consume the JSON Schema version

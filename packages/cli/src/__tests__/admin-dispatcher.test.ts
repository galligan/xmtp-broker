import { describe, test, expect } from "bun:test";
import { Result } from "better-result";
import { z } from "zod";
import {
  createActionRegistry,
  type ActionSpec,
  type HandlerContext,
} from "@xmtp/signet-contracts";
import { ValidationError, type SignetError } from "@xmtp/signet-schemas";
import { createAdminDispatcher } from "../admin/dispatcher.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeHandlerContext(
  overrides?: Partial<HandlerContext>,
): HandlerContext {
  return {
    signetId: "test-signet",
    signerProvider: {} as HandlerContext["signerProvider"],
    requestId: crypto.randomUUID(),
    signal: AbortSignal.timeout(5_000),
    ...overrides,
  };
}

function makeSpec(
  id: string,
  opts?: {
    command?: string;
    handler?: ActionSpec<unknown, unknown, SignetError>["handler"];
    input?: z.ZodType<unknown>;
  },
): ActionSpec<unknown, unknown, SignetError> {
  return {
    id,
    handler: opts?.handler ?? (async (input: unknown) => Result.ok(input)),
    input: opts?.input ?? z.object({}).passthrough(),
    cli: {
      command: opts?.command ?? id.replace(/\./g, ":"),
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AdminDispatcher", () => {
  test("dispatches to the handler via the canonical action id", async () => {
    const registry = createActionRegistry();
    const spec = makeSpec("credential.list", {
      command: "credential:list",
      handler: async () => Result.ok({ credentials: [] }),
    });
    registry.register(spec);

    const dispatcher = createAdminDispatcher(registry);
    const ctx = makeHandlerContext();
    const result = await dispatcher.dispatch("credential.list", {}, ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ credentials: [] });
    }
  });

  test("does not let a CLI command override change the RPC method", async () => {
    const registry = createActionRegistry();
    const spec = makeSpec("credential.revoke", {
      command: "credential:rm",
      handler: async () => Result.ok({ revoked: true }),
    });
    registry.register(spec);

    const dispatcher = createAdminDispatcher(registry);
    const ctx = makeHandlerContext();
    const result = await dispatcher.dispatch("credential.revoke", {}, ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ revoked: true });
    }
  });

  test("returns error for unknown method", async () => {
    const registry = createActionRegistry();
    const dispatcher = createAdminDispatcher(registry);
    const ctx = makeHandlerContext();
    const result = await dispatcher.dispatch("nonexistent.method", {}, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe("not_found");
    }
  });

  test("returns validation error when input fails schema", async () => {
    const registry = createActionRegistry();
    const spec = makeSpec("credential.issue", {
      command: "session:issue",
      input: z.object({
        agentId: z.string().min(1),
      }),
    });
    registry.register(spec);

    const dispatcher = createAdminDispatcher(registry);
    const ctx = makeHandlerContext();
    // Missing required agentId
    const result = await dispatcher.dispatch("credential.issue", {}, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe("validation");
    }
  });

  test("validate returns parsed params without invoking the handler", () => {
    const registry = createActionRegistry();
    let calls = 0;
    const spec = makeSpec("message.info", {
      input: z.object({
        chatId: z.string(),
        messageId: z.string(),
      }),
      handler: async () => {
        calls++;
        return Result.ok({});
      },
    });
    registry.register(spec);

    const dispatcher = createAdminDispatcher(registry);
    const result = dispatcher.validate("message.info", {
      chatId: "conv_validate_only",
      messageId: "msg_1",
    });

    expect(Result.isOk(result)).toBe(true);
    expect(calls).toBe(0);
  });

  test("dispatchValidated skips a second parse and invokes the handler", async () => {
    const registry = createActionRegistry();
    const spec = makeSpec("message.info", {
      input: z.object({
        chatId: z.string(),
        messageId: z.string(),
      }),
      handler: async (input) => Result.ok(input),
    });
    registry.register(spec);

    const dispatcher = createAdminDispatcher(registry);
    const ctx = makeHandlerContext();
    const result = await dispatcher.dispatchValidated(
      "message.info",
      {
        chatId: "conv_dispatch_validated",
        messageId: "msg_1",
      },
      ctx,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        chatId: "conv_dispatch_validated",
        messageId: "msg_1",
      });
    }
  });

  test("wraps handler error in ActionResult", async () => {
    const registry = createActionRegistry();
    const spec = makeSpec("key.rotate", {
      command: "key:rotate",
      handler: async () =>
        Result.err(ValidationError.create("keyId", "Key not found")),
    });
    registry.register(spec);

    const dispatcher = createAdminDispatcher(registry);
    const ctx = makeHandlerContext();
    const result = await dispatcher.dispatch("key.rotate", {}, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe("ValidationError");
    }
  });

  test("hasMethod returns true for registered method", () => {
    const registry = createActionRegistry();
    const spec = makeSpec("credential.list", {
      command: "session:list",
    });
    registry.register(spec);

    const dispatcher = createAdminDispatcher(registry);
    expect(dispatcher.hasMethod("credential.list")).toBe(true);
  });

  test("hasMethod returns false for unregistered method", () => {
    const registry = createActionRegistry();
    const dispatcher = createAdminDispatcher(registry);
    expect(dispatcher.hasMethod("unknown.method")).toBe(false);
  });

  test("handler that throws returns InternalError", async () => {
    const registry = createActionRegistry();
    const spec = makeSpec("boom.action", {
      command: "boom:action",
      handler: async () => {
        throw new Error("unexpected kaboom");
      },
    });
    registry.register(spec);

    const dispatcher = createAdminDispatcher(registry);
    const ctx = makeHandlerContext();
    const result = await dispatcher.dispatch("boom.action", {}, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe("InternalError");
      expect(result.error.message).toContain("unexpected kaboom");
    }
  });
});

import type {
  ActionRegistry,
  ActionResult,
  ActionSpec,
  HandlerContext,
} from "@xmtp/signet-contracts";
import { deriveRpcMethod, toActionResult } from "@xmtp/signet-contracts";
import type { SignetError, ActionResultMeta } from "@xmtp/signet-schemas";
import {
  InternalError,
  NotFoundError,
  ValidationError,
} from "@xmtp/signet-schemas";
import { Result } from "better-result";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Dispatches JSON-RPC method calls to ActionSpec handlers via the
 * shared ActionRegistry. Maps RPC method names to ActionSpecs using
 * the canonical action ID-derived RPC method.
 */
export interface AdminDispatcher {
  /** Validate params for a JSON-RPC method without invoking its handler. */
  validate(
    method: string,
    params: Record<string, unknown>,
  ): Result<Record<string, unknown>, SignetError>;

  /** Dispatch a request whose params have already been validated. */
  dispatchValidated(
    method: string,
    params: Record<string, unknown>,
    ctx: HandlerContext,
  ): Promise<ActionResult<unknown>>;

  /** Route a JSON-RPC method call to the matching ActionSpec handler. */
  dispatch(
    method: string,
    params: Record<string, unknown>,
    ctx: HandlerContext,
  ): Promise<ActionResult<unknown>>;

  /** Check whether a method name is registered. */
  hasMethod(method: string): boolean;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Build a lookup map from RPC method name to ActionSpec.
 */
function buildMethodMap(
  registry: ActionRegistry,
): Map<string, ActionSpec<unknown, unknown, SignetError>> {
  const map = new Map<string, ActionSpec<unknown, unknown, SignetError>>();

  for (const spec of registry.listForSurface("cli")) {
    const cli = spec.cli;
    if (cli === undefined) continue;

    map.set(deriveRpcMethod(spec), spec);
  }

  return map;
}

function makeMeta(ctx: HandlerContext, startMs: number): ActionResultMeta {
  return {
    requestId: ctx.requestId,
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startMs,
  };
}

function getSpec(
  methodMap: Map<string, ActionSpec<unknown, unknown, SignetError>>,
  method: string,
): Result<ActionSpec<unknown, unknown, SignetError>, SignetError> {
  const spec = methodMap.get(method);
  if (spec === undefined) {
    return Result.err(NotFoundError.create("Method", method));
  }
  return Result.ok(spec);
}

function validateParams(
  spec: ActionSpec<unknown, unknown, SignetError>,
  params: Record<string, unknown>,
): Result<Record<string, unknown>, SignetError> {
  const parseResult = spec.input.safeParse(params);
  if (!parseResult.success) {
    const issues = parseResult.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return Result.err(ValidationError.create("params", issues));
  }

  return Result.ok(parseResult.data as Record<string, unknown>);
}

/**
 * Create an AdminDispatcher that routes JSON-RPC methods to ActionSpecs
 * via the shared ActionRegistry.
 */
export function createAdminDispatcher(
  registry: ActionRegistry,
): AdminDispatcher {
  const methodMap = buildMethodMap(registry);

  return {
    validate(
      method: string,
      params: Record<string, unknown>,
    ): Result<Record<string, unknown>, SignetError> {
      const specResult = getSpec(methodMap, method);
      if (Result.isError(specResult)) {
        return specResult;
      }

      return validateParams(specResult.value, params);
    },

    async dispatchValidated(
      method: string,
      params: Record<string, unknown>,
      ctx: HandlerContext,
    ): Promise<ActionResult<unknown>> {
      const startMs = Date.now();
      const specResult = getSpec(methodMap, method);

      if (Result.isError(specResult)) {
        return toActionResult(specResult, makeMeta(ctx, startMs));
      }

      const spec = specResult.value;

      // Call the handler -- catch unexpected throws and wrap as InternalError
      let result: Awaited<ReturnType<typeof spec.handler>>;
      try {
        result = await spec.handler(params, ctx);
      } catch (thrown: unknown) {
        const message =
          thrown instanceof Error ? thrown.message : String(thrown);
        return toActionResult(
          Result.err(InternalError.create(`Handler threw: ${message}`)),
          makeMeta(ctx, startMs),
        );
      }
      return toActionResult(result, makeMeta(ctx, startMs));
    },

    async dispatch(
      method: string,
      params: Record<string, unknown>,
      ctx: HandlerContext,
    ): Promise<ActionResult<unknown>> {
      const startMs = Date.now();
      const paramsResult = this.validate(method, params);
      if (Result.isError(paramsResult)) {
        return toActionResult(paramsResult, makeMeta(ctx, startMs));
      }

      return this.dispatchValidated(method, paramsResult.value, ctx);
    },

    hasMethod(method: string): boolean {
      return methodMap.has(method);
    },
  };
}

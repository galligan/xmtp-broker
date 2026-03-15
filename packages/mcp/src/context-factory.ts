import type { HandlerContext, SignerProvider } from "@xmtp-broker/contracts";

/**
 * Parameters for building a HandlerContext for MCP callers.
 */
export interface ContextFactoryParams {
  readonly brokerId: string;
  readonly signerProvider: SignerProvider;
  readonly sessionId: string;
  readonly requestTimeoutMs: number;
}

/**
 * Build a HandlerContext for an MCP tool call.
 * Session-scoped: includes sessionId, no adminAuth.
 */
export function createHandlerContext(
  params: ContextFactoryParams,
): HandlerContext {
  return {
    brokerId: params.brokerId,
    signerProvider: params.signerProvider,
    requestId: crypto.randomUUID(),
    signal: AbortSignal.timeout(params.requestTimeoutMs),
    sessionId: params.sessionId,
    // No adminAuth -- MCP is session-scoped, not admin
  };
}

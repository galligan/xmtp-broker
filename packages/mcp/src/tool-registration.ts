import { zodToJsonSchema } from "zod-to-json-schema";
import {
  deriveMcpAnnotations,
  deriveMcpToolName,
  type ActionSpec,
} from "@xmtp/signet-contracts";
import type { SignetError } from "@xmtp/signet-schemas";

/**
 * MCP tool registration shape. Produced from an ActionSpec
 * with MCP surface metadata.
 */
export interface McpToolRegistration {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly annotations?: {
    readonly readOnlyHint?: boolean;
    readonly destructiveHint?: boolean;
    readonly idempotentHint?: boolean;
    readonly title?: string;
    readonly [key: string]: unknown;
  };
}

/**
 * Convert an ActionSpec into an MCP tool registration.
 * Returns undefined if the spec has no MCP surface metadata.
 */
export function actionSpecToMcpTool(
  spec: ActionSpec<unknown, unknown, SignetError>,
): McpToolRegistration | undefined {
  if (!spec.mcp) {
    return undefined;
  }

  const jsonSchema = zodToJsonSchema(spec.input, {
    $refStrategy: "none",
    errorMessages: true,
  });

  return {
    name: deriveMcpToolName(spec),
    description: spec.description ?? spec.id,
    inputSchema: jsonSchema as Record<string, unknown>,
    annotations: deriveMcpAnnotations(spec),
  };
}

/**
 * MCP transport adapter. Exposes signet ActionSpecs as credential-scoped
 * MCP tools via the Model Context Protocol SDK.
 * @module
 */

// Configuration
export { McpServerConfigSchema, type McpServerConfig } from "./config.js";

// Server
export {
  createMcpServer,
  type McpServerDeps,
  type McpServerInstance,
  type McpServerState,
} from "./server.js";

// Tool registration
export {
  actionSpecToMcpTool,
  type McpToolRegistration,
} from "./tool-registration.js";

// Call handler
export { handleCallTool, type CallToolRequest } from "./call-handler.js";

// Output formatting
export {
  formatActionResult,
  type McpContentResponse,
} from "./output-formatter.js";

// Context factory
export { createHandlerContext } from "./context-factory.js";

// Credential guard
export {
  validateCredential,
  checkCredentialLiveness,
  type TokenLookup,
  type CredentialLookup,
} from "./credential-guard.js";

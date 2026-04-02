/**
 * Utility commands that attach directly to the `xs` program root.
 *
 * Includes: logs, lookup, search, and consent management.
 * These are grouped here because they don't warrant individual files
 * but need richer option sets than simple stubs provide.
 *
 * @module
 */

import { Command } from "commander";
import { Result } from "better-result";
import type { AuditEntry } from "../audit/log.js";
import { formatOutput } from "../output/formatter.js";
import { exitCodeFromCategory } from "../output/exit-codes.js";
import {
  createWithDaemonClient,
  type WithDaemonClient,
} from "./daemon-client.js";

/** Stub action output for commands not yet wired to the daemon. */
function stubOutput(
  action: string,
  params: Record<string, unknown>,
  json: boolean,
): string {
  return formatOutput({ action, ...params }, { json }) + "\n";
}

/** Dependencies for utility commands. */
export interface XsUtilityCommandDeps {
  readonly withDaemonClient: WithDaemonClient;
}

const defaultUtilityDeps: XsUtilityCommandDeps = {
  withDaemonClient: createWithDaemonClient(),
};

/**
 * Create utility commands for the top-level program.
 *
 * Returns an array of Command instances to be added individually
 * to the program (not as a group).
 */
export function createUtilityCommands(
  deps: Partial<XsUtilityCommandDeps> = {},
): Command[] {
  const { withDaemonClient } = { ...defaultUtilityDeps, ...deps };
  const commands: Command[] = [];

  // --- logs ---

  const logs = new Command("logs")
    .description("View audit logs")
    .option("--since <time>", "Show logs since timestamp (ISO 8601)")
    .option("--limit <n>", "Limit number of entries")
    .option("--config <path>", "Path to config file")
    .option("--json", "JSON output")
    .action(
      async (opts: {
        since?: string;
        limit?: string;
        config?: string;
        json?: true;
      }) => {
        const json = opts.json === true;
        const input: Record<string, unknown> = {};
        if (opts.since !== undefined) input["since"] = opts.since;
        if (opts.limit !== undefined) {
          input["limit"] = Number.parseInt(opts.limit, 10);
        }

        const result = await withDaemonClient(
          { configPath: opts.config },
          async (client) =>
            client.request<readonly AuditEntry[]>("admin.logs", input),
        );

        if (Result.isError(result)) {
          process.stderr.write(
            formatOutput({ error: result.error.message }, { json }) + "\n",
          );
          process.exit(exitCodeFromCategory(result.error.category));
        }

        if (json) {
          process.stdout.write(formatOutput(result.value, { json }) + "\n");
        } else {
          for (const entry of result.value) {
            const line = `${entry.timestamp} [${entry.actor}] ${entry.action}${entry.success ? "" : " FAILED"}${entry.target !== undefined ? ` target=${entry.target}` : ""}`;
            process.stdout.write(line + "\n");
          }
        }
      },
    );
  logs
    .command("export")
    .description("Export the full audit log as NDJSON")
    .option("--config <path>", "Path to config file")
    .action(async (opts: { config?: string }) => {
      const result = await withDaemonClient(
        { configPath: opts.config },
        async (client) =>
          client.request<readonly AuditEntry[]>("admin.logs-export", {}),
      );

      if (Result.isError(result)) {
        process.stderr.write(
          formatOutput({ error: result.error.message }, { json: true }) + "\n",
        );
        process.exit(exitCodeFromCategory(result.error.category));
      }

      // NDJSON: one JSON object per line
      for (const entry of result.value) {
        process.stdout.write(JSON.stringify(entry) + "\n");
      }
    });
  commands.push(logs);

  // --- lookup ---

  const lookup = new Command("lookup")
    .description("Look up an address or ID")
    .argument("<address>", "Address or ID to look up")
    .option("--json", "JSON output")
    .action((address: string, opts: { json?: true }) => {
      process.stdout.write(
        stubOutput("lookup", { address }, opts.json === true),
      );
    });
  commands.push(lookup);

  // --- search ---

  const search = new Command("search")
    .description("Search conversations and messages")
    .argument("<query>", "Search query")
    .option("--chat <id>", "Filter by conversation")
    .option("--op <id>", "Filter by operator")
    .option("--limit <n>", "Limit results")
    .option("--json", "JSON output")
    .action(
      (
        query: string,
        opts: { chat?: string; op?: string; limit?: string; json?: true },
      ) => {
        const params: Record<string, unknown> = { query };
        if (opts.chat !== undefined) params["chatId"] = opts.chat;
        if (opts.op !== undefined) params["operatorId"] = opts.op;
        if (opts.limit !== undefined) {
          params["limit"] = Number.parseInt(opts.limit, 10);
        }
        process.stdout.write(stubOutput("search", params, opts.json === true));
      },
    );
  commands.push(search);

  // --- consent ---

  const consent = new Command("consent").description("Consent management");

  consent
    .command("check")
    .description("Check consent state for an entity")
    .argument("<entity>", "Entity to check (inbox ID or group ID)")
    .option("--type <type>", "Entity type: inbox_id or group_id", "inbox_id")
    .option("--as <label>", "Identity label to act as")
    .option("--config <path>", "Path to config file")
    .option("--json", "JSON output")
    .action(
      async (
        entity: string,
        opts: { type?: string; as?: string; config?: string; json?: true },
      ) => {
        const json = opts.json === true;
        const input: Record<string, unknown> = { entity };
        if (opts.type !== undefined) input["entityType"] = opts.type;
        if (opts.as !== undefined) input["identityLabel"] = opts.as;

        const result = await withDaemonClient(
          { configPath: opts.config },
          async (client) =>
            client.request<{
              entity: string;
              entityType: string;
              state: string;
            }>("consent.check", input),
        );

        if (Result.isError(result)) {
          process.stderr.write(
            formatOutput({ error: result.error.message }, { json }) + "\n",
          );
          process.exit(exitCodeFromCategory(result.error.category));
        }

        process.stdout.write(formatOutput(result.value, { json }) + "\n");
      },
    );

  consent
    .command("allow")
    .description("Allow messages from an entity")
    .argument("<entity>", "Entity to allow (inbox ID or group ID)")
    .option("--type <type>", "Entity type: inbox_id or group_id", "inbox_id")
    .option("--as <label>", "Identity label to act as")
    .option("--config <path>", "Path to config file")
    .option("--json", "JSON output")
    .action(
      async (
        entity: string,
        opts: { type?: string; as?: string; config?: string; json?: true },
      ) => {
        const json = opts.json === true;
        const input: Record<string, unknown> = { entity };
        if (opts.type !== undefined) input["entityType"] = opts.type;
        if (opts.as !== undefined) input["identityLabel"] = opts.as;

        const result = await withDaemonClient(
          { configPath: opts.config },
          async (client) =>
            client.request<{
              entity: string;
              entityType: string;
              state: string;
            }>("consent.allow", input),
        );

        if (Result.isError(result)) {
          process.stderr.write(
            formatOutput({ error: result.error.message }, { json }) + "\n",
          );
          process.exit(exitCodeFromCategory(result.error.category));
        }

        process.stdout.write(formatOutput(result.value, { json }) + "\n");
      },
    );

  consent
    .command("deny")
    .description("Deny messages from an entity")
    .argument("<entity>", "Entity to deny (inbox ID or group ID)")
    .option("--type <type>", "Entity type: inbox_id or group_id", "inbox_id")
    .option("--as <label>", "Identity label to act as")
    .option("--config <path>", "Path to config file")
    .option("--json", "JSON output")
    .action(
      async (
        entity: string,
        opts: { type?: string; as?: string; config?: string; json?: true },
      ) => {
        const json = opts.json === true;
        const input: Record<string, unknown> = { entity };
        if (opts.type !== undefined) input["entityType"] = opts.type;
        if (opts.as !== undefined) input["identityLabel"] = opts.as;

        const result = await withDaemonClient(
          { configPath: opts.config },
          async (client) =>
            client.request<{
              entity: string;
              entityType: string;
              state: string;
            }>("consent.deny", input),
        );

        if (Result.isError(result)) {
          process.stderr.write(
            formatOutput({ error: result.error.message }, { json }) + "\n",
          );
          process.exit(exitCodeFromCategory(result.error.category));
        }

        process.stdout.write(formatOutput(result.value, { json }) + "\n");
      },
    );

  commands.push(consent);

  return commands;
}

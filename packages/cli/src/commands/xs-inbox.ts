/**
 * Inbox management commands for the `xs inbox` subcommand group.
 *
 * All inbox operations flow through the daemon-backed action surface.
 *
 * @module
 */

import { Command } from "commander";
import type { SignetError } from "@xmtp/signet-schemas";
import { exitCodeFromCategory } from "../output/exit-codes.js";
import { formatOutput } from "../output/formatter.js";
import {
  createWithDaemonClient,
  type WithDaemonClient,
} from "./daemon-client.js";

/** Dependencies for v1 inbox commands. */
export interface XsInboxCommandDeps {
  readonly withDaemonClient: WithDaemonClient;
  readonly writeStdout: (message: string) => void;
  readonly writeStderr: (message: string) => void;
  readonly exit: (code: number) => void;
}

const defaultDeps: XsInboxCommandDeps = {
  withDaemonClient: createWithDaemonClient(),
  writeStdout(message) {
    process.stdout.write(message);
  },
  writeStderr(message) {
    process.stderr.write(message);
  },
  exit(code) {
    process.exit(code);
  },
};

function writeError(
  deps: XsInboxCommandDeps,
  error: SignetError,
  json: boolean,
): void {
  deps.writeStderr(
    formatOutput(
      {
        error: error._tag,
        category: error.category,
        message: error.message,
        ...(error.context !== null ? { context: error.context } : {}),
      },
      { json },
    ) + "\n",
  );
  deps.exit(exitCodeFromCategory(error.category));
}

function selectInfoOutput(
  value: Record<string, unknown>,
  opts: { network?: true; only?: string },
): unknown {
  if (opts.network === true) {
    return value["networkInboxId"] ?? null;
  }

  if (typeof opts.only === "string" && opts.only.length > 0) {
    return value[opts.only];
  }

  return value;
}

/** Create the `inbox` subcommand group. */
export function createInboxCommands(
  deps: Partial<XsInboxCommandDeps> = {},
): Command {
  const resolvedDeps: XsInboxCommandDeps = { ...defaultDeps, ...deps };
  const cmd = new Command("inbox").description("Inbox management");

  cmd
    .command("create")
    .description("Create a managed inbox")
    .option("--config <path>", "Path to config file")
    .option("--label <name>", "Human-readable inbox label")
    .option("--op <id>", "Link the inbox to an operator")
    .option("--json", "JSON output")
    .action(
      async (opts: {
        config?: string;
        label?: string;
        op?: string;
        json?: true;
      }) => {
        const json = opts.json === true;
        const payload: Record<string, unknown> = {};
        if (opts.label !== undefined) payload["label"] = opts.label;
        if (opts.op !== undefined) payload["operatorId"] = opts.op;

        const result = await resolvedDeps.withDaemonClient(
          { configPath: opts.config },
          (client) => client.request("inbox.create", payload),
        );

        if (result.isErr()) {
          writeError(resolvedDeps, result.error, json);
          return;
        }

        resolvedDeps.writeStdout(formatOutput(result.value, { json }) + "\n");
      },
    );

  cmd
    .command("list")
    .description("List managed inboxes")
    .option("--config <path>", "Path to config file")
    .option("--json", "JSON output")
    .action(async (opts: { config?: string; json?: true }) => {
      const json = opts.json === true;
      const result = await resolvedDeps.withDaemonClient(
        { configPath: opts.config },
        (client) => client.request("inbox.list", {}),
      );

      if (result.isErr()) {
        writeError(resolvedDeps, result.error, json);
        return;
      }

      resolvedDeps.writeStdout(formatOutput(result.value, { json }) + "\n");
    });

  cmd
    .command("info")
    .description("Show managed inbox details")
    .argument("<id>", "Inbox ID or label")
    .option("--config <path>", "Path to config file")
    .option("--network", "Only print the network inbox ID")
    .option("--only <field>", "Only print a single field from the inbox record")
    .option("--json", "JSON output")
    .action(
      async (
        id: string,
        opts: {
          config?: string;
          network?: true;
          only?: string;
          json?: true;
        },
      ) => {
        const json = opts.json === true;
        const result = await resolvedDeps.withDaemonClient(
          { configPath: opts.config },
          (client) => client.request("inbox.info", { inboxId: id }),
        );

        if (result.isErr()) {
          writeError(resolvedDeps, result.error, json);
          return;
        }

        const output = selectInfoOutput(
          result.value as Record<string, unknown>,
          opts,
        );
        resolvedDeps.writeStdout(formatOutput(output, { json }) + "\n");
      },
    );

  cmd
    .command("rm")
    .description("Remove a managed inbox from local signet state")
    .argument("<id>", "Inbox ID or label")
    .option("--config <path>", "Path to config file")
    .option("--force", "Execute removal instead of showing the dry-run plan")
    .option("--json", "JSON output")
    .action(
      async (
        id: string,
        opts: { config?: string; force?: true; json?: true },
      ) => {
        const json = opts.json === true;
        const result = await resolvedDeps.withDaemonClient(
          { configPath: opts.config },
          (client) =>
            client.request("inbox.rm", {
              inboxId: id,
              execute: opts.force === true,
            }),
        );

        if (result.isErr()) {
          writeError(resolvedDeps, result.error, json);
          return;
        }

        resolvedDeps.writeStdout(formatOutput(result.value, { json }) + "\n");
      },
    );

  cmd
    .command("link")
    .description("Link a managed inbox to an operator")
    .argument("<id>", "Inbox ID or label")
    .requiredOption("--op <id>", "Operator ID or label")
    .option("--config <path>", "Path to config file")
    .option("--json", "JSON output")
    .action(
      async (
        id: string,
        opts: { op: string; config?: string; json?: true },
      ) => {
        const json = opts.json === true;
        const result = await resolvedDeps.withDaemonClient(
          { configPath: opts.config },
          (client) =>
            client.request("inbox.link", {
              inboxId: id,
              operatorId: opts.op,
            }),
        );

        if (result.isErr()) {
          writeError(resolvedDeps, result.error, json);
          return;
        }

        resolvedDeps.writeStdout(formatOutput(result.value, { json }) + "\n");
      },
    );

  cmd
    .command("unlink")
    .description("Unlink a managed inbox from its operator")
    .argument("<id>", "Inbox ID or label")
    .option("--config <path>", "Path to config file")
    .option("--json", "JSON output")
    .action(async (id: string, opts: { config?: string; json?: true }) => {
      const json = opts.json === true;
      const result = await resolvedDeps.withDaemonClient(
        { configPath: opts.config },
        (client) => client.request("inbox.unlink", { inboxId: id }),
      );

      if (result.isErr()) {
        writeError(resolvedDeps, result.error, json);
        return;
      }

      resolvedDeps.writeStdout(formatOutput(result.value, { json }) + "\n");
    });

  return cmd;
}

/**
 * Message commands for the `xs msg` subcommand group.
 *
 * Provides messaging operations (send, reply, react, read, list, info)
 * via the daemon admin socket. Each action constructs an RPC-compatible
 * payload and delegates to the daemon client.
 *
 * @module
 */

import { Command, InvalidArgumentError } from "commander";
import { formatOutput } from "../output/formatter.js";

/** Stub action output for commands not yet wired to the daemon. */
function stubOutput(
  action: string,
  params: Record<string, unknown>,
  json: boolean,
): string {
  return formatOutput({ action, ...params }, { json }) + "\n";
}

/**
 * Create the `msg` subcommand group.
 *
 * Subcommands: send, reply, react, read, list, info.
 */
export function createMessageCommands(): Command {
  const cmd = new Command("msg").description("Messaging");

  cmd
    .command("send")
    .description("Send a message")
    .argument("<text>", "Message text")
    .requiredOption("--to <id>", "Conversation ID")
    .option("--as <inbox>", "Inbox ID to act as")
    .option("--op <operator>", "Operator ID")
    .option("--json", "JSON output")
    .action(
      (
        text: string,
        opts: {
          to: string;
          as?: string;
          op?: string;
          json?: true;
        },
      ) => {
        const json = opts.json === true;
        const params: Record<string, unknown> = {
          text,
          chatId: opts.to,
        };
        if (opts.as !== undefined) params["as"] = opts.as;
        if (opts.op !== undefined) params["operatorId"] = opts.op;
        process.stdout.write(stubOutput("msg.send", params, json));
      },
    );

  cmd
    .command("reply")
    .description("Reply to a message")
    .argument("<text>", "Reply text")
    .requiredOption("--to <msg-id>", "Message ID to reply to")
    .option("--as <inbox>", "Inbox ID to act as")
    .option("--json", "JSON output")
    .action((text: string, opts: { to: string; as?: string; json?: true }) => {
      const json = opts.json === true;
      const params: Record<string, unknown> = { text, messageId: opts.to };
      if (opts.as !== undefined) params["as"] = opts.as;
      process.stdout.write(stubOutput("msg.reply", params, json));
    });

  cmd
    .command("react")
    .description("React to a message")
    .argument("<emoji>", "Reaction emoji")
    .requiredOption("--to <msg-id>", "Message ID to react to")
    .option("--as <inbox>", "Inbox ID to act as")
    .action((emoji: string, opts: { to: string; as?: string }) => {
      const params: Record<string, unknown> = {
        emoji,
        messageId: opts.to,
      };
      if (opts.as !== undefined) params["as"] = opts.as;
      process.stdout.write(stubOutput("msg.react", params, false));
    });

  cmd
    .command("read")
    .description("Mark messages as read")
    .argument("[ids]", "Message IDs (comma-separated)")
    .option("--chat <id>", "Conversation ID")
    .option("--all", "Mark all messages in chat as read")
    .option("--as <inbox>", "Inbox ID to act as")
    .option("--json", "JSON output")
    .action(
      (
        ids: string | undefined,
        opts: { chat?: string; all?: true; as?: string; json?: true },
      ) => {
        if (opts.all === true && ids !== undefined) {
          throw new InvalidArgumentError(
            "Provide message IDs or --all, but not both",
          );
        }
        if (opts.all !== true && ids === undefined) {
          throw new InvalidArgumentError(
            "Provide message IDs or --all to choose what to mark as read",
          );
        }

        const params: Record<string, unknown> = {};
        if (ids !== undefined) {
          params["messageIds"] = ids.split(",");
        }
        if (opts.chat !== undefined) params["chatId"] = opts.chat;
        if (opts.all === true) params["all"] = true;
        if (opts.as !== undefined) params["as"] = opts.as;
        process.stdout.write(
          stubOutput("msg.read", params, opts.json === true),
        );
      },
    );

  cmd
    .command("list")
    .description("List messages")
    .requiredOption("--from <chat>", "Conversation ID")
    .option("--as <inbox>", "Inbox ID to act as")
    .option("--watch", "Watch for new messages")
    .option("--json", "JSON output")
    .action(
      (opts: { from: string; as?: string; watch?: true; json?: true }) => {
        const json = opts.json === true;
        const params: Record<string, unknown> = { chatId: opts.from };
        if (opts.as !== undefined) params["as"] = opts.as;
        if (opts.watch === true) params["watch"] = true;
        process.stdout.write(stubOutput("msg.list", params, json));
      },
    );

  cmd
    .command("info")
    .description("Show message details")
    .argument("<msg-id>", "Message ID")
    .option("--as <inbox>", "Inbox ID to act as")
    .option("--json", "JSON output")
    .action((msgId: string, opts: { as?: string; json?: true }) => {
      const json = opts.json === true;
      const params: Record<string, unknown> = { messageId: msgId };
      if (opts.as !== undefined) params["as"] = opts.as;
      process.stdout.write(stubOutput("msg.info", params, json));
    });

  return cmd;
}

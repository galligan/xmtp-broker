/**
 * Chat management commands for the `xs chat` subcommand group.
 *
 * Provides conversation lifecycle operations (create, list, info, update,
 * sync, join, invite, leave, rm) and member management via the daemon
 * admin socket. Each action constructs an RPC-compatible payload and
 * delegates to the daemon client.
 *
 * @module
 */

import { Command } from "commander";
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
 * Create the `chat` subcommand group.
 *
 * Subcommands: create, list, info, update, sync, join, invite, leave, rm, member.
 */
export function createChatCommands(): Command {
  const cmd = new Command("chat").description("Chat management");

  cmd
    .command("create")
    .description("Create a conversation")
    .requiredOption("--name <name>", "Conversation name")
    .option("--as <inbox>", "Inbox ID to act as")
    .option("--op <operator>", "Operator ID")
    .option("--json", "JSON output")
    .action((opts: { name: string; as?: string; op?: string; json?: true }) => {
      const json = opts.json === true;
      const params: Record<string, unknown> = { name: opts.name };
      if (opts.as !== undefined) params["as"] = opts.as;
      if (opts.op !== undefined) params["operatorId"] = opts.op;
      process.stdout.write(stubOutput("chat.create", params, json));
    });

  cmd
    .command("list")
    .description("List conversations")
    .option("--op <operator>", "Filter by operator")
    .option("--watch", "Watch for changes")
    .option("--json", "JSON output")
    .action((opts: { op?: string; watch?: true; json?: true }) => {
      const json = opts.json === true;
      const params: Record<string, unknown> = {};
      if (opts.op !== undefined) params["operatorId"] = opts.op;
      if (opts.watch === true) params["watch"] = true;
      process.stdout.write(stubOutput("chat.list", params, json));
    });

  cmd
    .command("info")
    .description("Show conversation details")
    .argument("<id>", "Conversation ID")
    .option("--only <field>", "Show only a specific field")
    .option("--json", "JSON output")
    .action((id: string, opts: { only?: string; json?: true }) => {
      const json = opts.json === true;
      const params: Record<string, unknown> = { id };
      if (opts.only !== undefined) params["only"] = opts.only;
      process.stdout.write(stubOutput("chat.info", params, json));
    });

  cmd
    .command("update")
    .description("Update conversation metadata")
    .argument("<id>", "Conversation ID")
    .option("--name <name>", "New name")
    .option("--description <desc>", "New description")
    .option("--image <url>", "New image URL")
    .action(
      (
        id: string,
        opts: { name?: string; description?: string; image?: string },
      ) => {
        const params: Record<string, unknown> = { id };
        if (opts.name !== undefined) params["name"] = opts.name;
        if (opts.description !== undefined) {
          params["description"] = opts.description;
        }
        if (opts.image !== undefined) params["image"] = opts.image;
        process.stdout.write(stubOutput("chat.update", params, false));
      },
    );

  cmd
    .command("sync")
    .description("Sync conversations")
    .argument("[id]", "Optional conversation ID")
    .action((id?: string) => {
      const params: Record<string, unknown> = {};
      if (id !== undefined) params["id"] = id;
      process.stdout.write(stubOutput("chat.sync", params, false));
    });

  cmd
    .command("join")
    .description("Join a conversation via invite link")
    .argument("<url>", "Invite URL")
    .option("--as <inbox>", "Inbox ID to act as")
    .action((url: string, opts: { as?: string }) => {
      const params: Record<string, unknown> = { url };
      if (opts.as !== undefined) params["as"] = opts.as;
      process.stdout.write(stubOutput("chat.join", params, false));
    });

  cmd
    .command("invite")
    .description("Generate an invite link")
    .argument("<id>", "Conversation ID")
    .option("--json", "JSON output")
    .action((id: string, opts: { json?: true }) => {
      const json = opts.json === true;
      process.stdout.write(stubOutput("chat.invite", { id }, json));
    });

  cmd
    .command("leave")
    .description("Leave a conversation")
    .argument("<id>", "Conversation ID")
    .action((id: string) => {
      process.stdout.write(stubOutput("chat.leave", { id }, false));
    });

  cmd
    .command("rm")
    .description("Remove a conversation")
    .argument("<id>", "Conversation ID")
    .option("--force", "Execute without confirmation")
    .action((id: string, opts: { force?: true }) => {
      process.stdout.write(
        stubOutput("chat.rm", { id, force: opts.force === true }, false),
      );
    });

  // --- member subgroup ---

  const member = new Command("member").description("Manage chat members");

  member
    .command("list")
    .description("List members of a conversation")
    .argument("<id>", "Conversation ID")
    .action((id: string) => {
      process.stdout.write(stubOutput("chat.member.list", { id }, false));
    });

  member
    .command("add")
    .description("Add a member to a conversation")
    .argument("<id>", "Conversation ID")
    .argument("<inbox>", "Inbox ID to add")
    .action((id: string, inbox: string) => {
      process.stdout.write(stubOutput("chat.member.add", { id, inbox }, false));
    });

  member
    .command("rm")
    .description("Remove a member from a conversation")
    .argument("<id>", "Conversation ID")
    .argument("<inbox>", "Inbox ID to remove")
    .action((id: string, inbox: string) => {
      process.stdout.write(stubOutput("chat.member.rm", { id, inbox }, false));
    });

  member
    .command("promote")
    .description("Promote a member to admin")
    .argument("<id>", "Conversation ID")
    .argument("<inbox>", "Inbox ID to promote")
    .action((id: string, inbox: string) => {
      process.stdout.write(
        stubOutput("chat.member.promote", { id, inbox }, false),
      );
    });

  member
    .command("demote")
    .description("Demote a member from admin")
    .argument("<id>", "Conversation ID")
    .argument("<inbox>", "Inbox ID to demote")
    .action((id: string, inbox: string) => {
      process.stdout.write(
        stubOutput("chat.member.demote", { id, inbox }, false),
      );
    });

  cmd.addCommand(member);

  return cmd;
}

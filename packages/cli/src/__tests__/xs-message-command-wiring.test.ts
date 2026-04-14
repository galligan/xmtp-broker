import { describe, expect, test } from "bun:test";
import { Result } from "better-result";
import type { SignetError } from "@xmtp/signet-schemas";
import type { AdminClient } from "../admin/client.js";
import { createMessageCommands } from "../commands/xs-message.js";

interface RequestCall {
  readonly method: string;
  readonly params: Record<string, unknown> | undefined;
}

function createHarness<T>(response: T) {
  const requestCalls: RequestCall[] = [];
  const stdout: string[] = [];
  const stderr: string[] = [];

  const client: AdminClient = {
    async connect() {
      return Result.ok(undefined);
    },
    async request(method, params) {
      requestCalls.push({ method, params });
      return Result.ok(response);
    },
    async close() {},
  };

  return {
    deps: {
      async withDaemonClient<TResult>(
        options: { configPath?: string | undefined },
        run: (
          adminClient: AdminClient,
        ) => Promise<Result<TResult, SignetError>>,
      ): Promise<Result<TResult, SignetError>> {
        expect(options).toEqual({ configPath: "/tmp/test.toml" });
        return run(client);
      },
      writeStdout(message: string) {
        stdout.push(message);
      },
      writeStderr(message: string) {
        stderr.push(message);
      },
      exit() {},
    },
    requestCalls,
    stdout,
    stderr,
  };
}

describe("xs msg list", () => {
  test("routes dangerous admin read flag through the daemon client", async () => {
    const harness = createHarness({ chatId: "conv_1", messages: [] });
    const command = createMessageCommands(harness.deps);

    await command.parseAsync([
      "node",
      "msg",
      "list",
      "--from",
      "conv_1",
      "--dangerously-allow-message-read",
      "--config",
      "/tmp/test.toml",
    ]);

    expect(harness.requestCalls).toEqual([
      {
        method: "message.list",
        params: {
          chatId: "conv_1",
          dangerouslyAllowMessageRead: true,
        },
      },
    ]);
  });
});

describe("xs msg info", () => {
  test("routes dangerous admin read flag through the daemon client", async () => {
    const harness = createHarness({
      messageId: "msg_1",
      groupId: "group-1",
    });
    const command = createMessageCommands(harness.deps);

    await command.parseAsync([
      "node",
      "msg",
      "info",
      "msg_1",
      "--chat",
      "conv_1",
      "--dangerously-allow-message-read",
      "--config",
      "/tmp/test.toml",
    ]);

    expect(harness.requestCalls).toEqual([
      {
        method: "message.info",
        params: {
          chatId: "conv_1",
          messageId: "msg_1",
          dangerouslyAllowMessageRead: true,
        },
      },
    ]);
  });
});

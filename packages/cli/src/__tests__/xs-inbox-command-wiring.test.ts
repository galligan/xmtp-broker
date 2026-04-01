import { describe, expect, test } from "bun:test";
import { Result } from "better-result";
import { InternalError, type SignetError } from "@xmtp/signet-schemas";
import type { AdminClient } from "../admin/client.js";
import { createInboxCommands } from "../commands/xs-inbox.js";

interface RequestCall {
  readonly method: string;
  readonly params: Record<string, unknown> | undefined;
}

function createHarness<T>(response: T) {
  const requestCalls: RequestCall[] = [];
  const stdout: string[] = [];
  const stderr: string[] = [];
  let exitCode: number | undefined;

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
      exit(code: number) {
        exitCode = code;
      },
    },
    requestCalls,
    stdout,
    stderr,
    get exitCode() {
      return exitCode;
    },
  };
}

function createErrorHarness(error: SignetError) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let exitCode: number | undefined;

  return {
    deps: {
      async withDaemonClient<TResult>(): Promise<Result<TResult, SignetError>> {
        return Result.err(error);
      },
      writeStdout(message: string) {
        stdout.push(message);
      },
      writeStderr(message: string) {
        stderr.push(message);
      },
      exit(code: number) {
        exitCode = code;
      },
    },
    stdout,
    stderr,
    get exitCode() {
      return exitCode;
    },
  };
}

describe("xs inbox commands", () => {
  test("routes create through the daemon client", async () => {
    const harness = createHarness({
      id: "inbox_abcd1234feedbabe",
      networkInboxId: "xmtp-inbox-1",
    });
    const command = createInboxCommands(harness.deps);

    await command.parseAsync([
      "node",
      "inbox",
      "create",
      "--label",
      "support",
      "--op",
      "alpha",
      "--config",
      "/tmp/test.toml",
    ]);

    expect(harness.requestCalls).toEqual([
      {
        method: "inbox.create",
        params: { label: "support", operatorId: "alpha" },
      },
    ]);
  });

  test("routes list through the daemon client", async () => {
    const harness = createHarness([]);
    const command = createInboxCommands(harness.deps);

    await command.parseAsync([
      "node",
      "inbox",
      "list",
      "--config",
      "/tmp/test.toml",
    ]);

    expect(harness.requestCalls).toEqual([
      {
        method: "inbox.list",
        params: {},
      },
    ]);
  });

  test("routes info through the daemon client", async () => {
    const harness = createHarness({
      id: "inbox_abcd1234feedbabe",
    });
    const command = createInboxCommands(harness.deps);

    await command.parseAsync([
      "node",
      "inbox",
      "info",
      "support",
      "--config",
      "/tmp/test.toml",
    ]);

    expect(harness.requestCalls).toEqual([
      {
        method: "inbox.info",
        params: { inboxId: "support" },
      },
    ]);
  });

  test("routes rm through the daemon client with execute when --force is present", async () => {
    const harness = createHarness({
      executed: true,
      actions: [],
    });
    const command = createInboxCommands(harness.deps);

    await command.parseAsync([
      "node",
      "inbox",
      "rm",
      "support",
      "--force",
      "--config",
      "/tmp/test.toml",
    ]);

    expect(harness.requestCalls).toEqual([
      {
        method: "inbox.rm",
        params: { inboxId: "support", execute: true },
      },
    ]);
  });

  test("routes link and unlink through the daemon client", async () => {
    const harness = createHarness({
      id: "inbox_abcd1234feedbabe",
    });
    const command = createInboxCommands(harness.deps);

    await command.parseAsync([
      "node",
      "inbox",
      "link",
      "support",
      "--op",
      "alpha",
      "--config",
      "/tmp/test.toml",
    ]);
    await command.parseAsync([
      "node",
      "inbox",
      "unlink",
      "support",
      "--config",
      "/tmp/test.toml",
    ]);

    expect(harness.requestCalls).toEqual([
      {
        method: "inbox.link",
        params: { inboxId: "support", operatorId: "alpha" },
      },
      {
        method: "inbox.unlink",
        params: { inboxId: "support" },
      },
    ]);
  });
});

describe("xs inbox command errors", () => {
  test("writes daemon errors to stderr", async () => {
    const harness = createErrorHarness(InternalError.create("boom"));
    const command = createInboxCommands(harness.deps);

    await command.parseAsync(["node", "inbox", "list"]);

    expect(harness.stdout).toEqual([]);
    expect(harness.stderr[0]).toContain("category: internal");
    expect(harness.exitCode).toBe(8);
  });
});

import { describe, expect, test } from "bun:test";
import { Result } from "better-result";
import { InternalError, type SignetError } from "@xmtp/signet-schemas";
import type { AdminClient } from "../admin/client.js";
import { createOperatorCommands } from "../commands/xs-operator.js";

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

describe("xs operator create", () => {
  test("routes disclosure flags through the daemon client", async () => {
    const harness = createHarness({ id: "op_abc" });
    const command = createOperatorCommands(harness.deps);

    await command.parseAsync([
      "node",
      "operator",
      "create",
      "--label",
      "alpha",
      "--role",
      "operator",
      "--scope",
      "shared",
      "--provider",
      "internal",
      "--inference-mode",
      "hybrid",
      "--inference-providers",
      "openai,anthropic",
      "--content-egress-scope",
      "provider-only",
      "--retention-at-provider",
      "30 days",
      "--hosting-mode",
      "cloud",
      "--config",
      "/tmp/test.toml",
    ]);

    expect(harness.requestCalls).toEqual([
      {
        method: "operator.create",
        params: {
          label: "alpha",
          role: "operator",
          scopeMode: "shared",
          provider: "internal",
          operatorDisclosures: {
            inferenceMode: "hybrid",
            inferenceProviders: ["openai", "anthropic"],
            contentEgressScope: "provider-only",
            retentionAtProvider: "30 days",
            hostingMode: "cloud",
          },
        },
      },
    ]);
    expect(harness.stderr).toEqual([]);
  });
});

describe("xs operator create errors", () => {
  test("writes daemon errors to stderr", async () => {
    const harness = createErrorHarness(InternalError.create("boom"));
    const command = createOperatorCommands(harness.deps);

    await command.parseAsync([
      "node",
      "operator",
      "create",
      "--label",
      "alpha",
      "--config",
      "/tmp/test.toml",
    ]);

    expect(harness.stdout).toEqual([]);
    expect(harness.stderr[0]).toContain("category: internal");
    expect(harness.exitCode).toBe(8);
  });
});

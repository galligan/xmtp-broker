import { Result } from "better-result";
import { z } from "zod";
import type { ActionSpec } from "@xmtp/signet-contracts";
import type { SignetError } from "@xmtp/signet-schemas";
import type { DaemonStatus } from "../daemon/status.js";

export interface BrokerActionDeps {
  readonly status: () => Promise<DaemonStatus>;
  readonly shutdown: () => Promise<Result<void, SignetError>>;
}

function widenActionSpec<TInput, TOutput>(
  spec: ActionSpec<TInput, TOutput, SignetError>,
): ActionSpec<unknown, unknown, SignetError> {
  return spec as ActionSpec<unknown, unknown, SignetError>;
}

export function createBrokerActions(
  deps: BrokerActionDeps,
): ActionSpec<unknown, unknown, SignetError>[] {
  const createStatusSpec = (
    id: string,
    command: string,
    rpcMethod: string,
  ): ActionSpec<Record<string, never>, DaemonStatus, SignetError> => ({
    id,
    input: z.object({}),
    handler: async () => Result.ok(await deps.status()),
    cli: {
      command,
      rpcMethod,
    },
  });

  const createStopSpec = (
    id: string,
    command: string,
    rpcMethod: string,
  ): ActionSpec<
    { force?: boolean | undefined },
    { stopped: true },
    SignetError
  > => ({
    id,
    input: z.object({
      force: z.boolean().optional(),
    }),
    handler: async () => {
      const result = await deps.shutdown();
      if (Result.isError(result)) {
        return result;
      }
      return Result.ok({ stopped: true as const });
    },
    cli: {
      command,
      rpcMethod,
    },
  });

  return [
    widenActionSpec(
      createStatusSpec("signet.status", "signet:status", "signet.status"),
    ),
    widenActionSpec(
      createStopSpec("signet.stop", "signet:stop", "signet.stop"),
    ),
    // Keep broker-prefixed methods for backward compatibility with older clients.
    widenActionSpec(
      createStatusSpec("broker.status", "broker:status", "broker.status"),
    ),
    widenActionSpec(
      createStopSpec("broker.stop", "broker:stop", "broker.stop"),
    ),
  ];
}

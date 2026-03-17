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
  const status: ActionSpec<Record<string, never>, DaemonStatus, SignetError> = {
    id: "broker.status",
    input: z.object({}),
    handler: async () => Result.ok(await deps.status()),
    cli: {
      command: "broker:status",
      rpcMethod: "broker.status",
    },
  };

  const stop: ActionSpec<
    { force?: boolean | undefined },
    { stopped: true },
    SignetError
  > = {
    id: "broker.stop",
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
      command: "broker:stop",
      rpcMethod: "broker.stop",
    },
  };

  return [widenActionSpec(status), widenActionSpec(stop)];
}

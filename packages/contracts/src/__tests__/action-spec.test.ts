import { describe, expect, it } from "bun:test";
import { Ok } from "better-result";
import { z } from "zod";
import type { SignetError } from "@xmtp/signet-schemas";
import type { ActionSpec } from "../action-spec.js";
import type { HandlerContext } from "../handler-types.js";

describe("ActionSpec", () => {
  it("supports the richer authored contract shape", () => {
    const spec = {
      id: "credential.list",
      input: z.object({
        operatorId: z.string(),
      }),
      output: z.object({
        items: z.array(z.string()),
      }),
      handler: (_input: { operatorId: string }, _ctx: HandlerContext) =>
        Promise.resolve(new Ok({ items: [] })),
      description: "List credentials for an operator",
      intent: "read",
      idempotent: true,
      metadata: {
        internal: false,
        domain: "credential",
      },
      examples: [
        {
          name: "list credentials",
          input: {
            operatorId: "op_1234",
          },
          expected: {
            items: [],
          },
        },
      ],
      cli: {},
      mcp: {},
      http: {
        auth: "admin",
        expose: true,
      },
    } satisfies ActionSpec<
      { operatorId: string },
      { items: string[] },
      SignetError
    >;

    expect(spec.description).toBe("List credentials for an operator");
    expect(spec.intent).toBe("read");
    expect(spec.idempotent).toBe(true);
    expect(spec.http?.auth).toBe("admin");
    expect(spec.examples?.[0]?.name).toBe("list credentials");
  });
});

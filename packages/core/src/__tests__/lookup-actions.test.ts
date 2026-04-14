import { beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { Result } from "better-result";
import type { HandlerContext } from "@xmtp/signet-contracts";
import { SqliteIdentityStore } from "../identity-store.js";
import { createSqliteIdMappingStore } from "../id-mapping-store.js";
import {
  createLookupActions,
  type LookupActionDeps,
} from "../lookup-actions.js";

function stubCtx(): HandlerContext {
  return {
    requestId: "test-req-1",
    signal: AbortSignal.timeout(5_000),
  };
}

describe("createLookupActions", () => {
  let identityStore: SqliteIdentityStore;
  let idMappings: ReturnType<typeof createSqliteIdMappingStore>;

  beforeEach(() => {
    identityStore = new SqliteIdentityStore(":memory:");
    idMappings = createSqliteIdMappingStore(new Database(":memory:"));
  });

  function buildDeps(extra?: Partial<LookupActionDeps>): LookupActionDeps {
    return {
      identityStore,
      idMappings,
      ...extra,
    };
  }

  test("resolves a mapped network inbox ID to the local inbox record", async () => {
    const created = await identityStore.create("group-1", "support");
    expect(Result.isOk(created)).toBe(true);
    if (Result.isError(created)) {
      throw new Error("identityStore.create failed");
    }

    await identityStore.setInboxId(created.value.id, "xmtp-inbox-1");
    idMappings.set("xmtp-inbox-1", created.value.id, "inbox");

    const actions = createLookupActions(buildDeps());
    const spec = actions.find((action) => action.id === "lookup.resolve");
    expect(spec).toBeDefined();

    const result = await spec!.handler!({ query: "xmtp-inbox-1" }, stubCtx());
    expect(Result.isOk(result)).toBe(true);
    if (Result.isError(result)) {
      throw new Error("lookup.resolve failed");
    }

    expect(result.value.found).toBe(true);
    expect(result.value.mapping).toEqual({
      localId: created.value.id,
      networkId: "xmtp-inbox-1",
    });
    expect(result.value.inbox).toEqual(
      expect.objectContaining({
        id: created.value.id,
        label: "support",
        networkInboxId: "xmtp-inbox-1",
        groupId: "group-1",
      }),
    );
  });

  test("resolves an operator by exact label", async () => {
    const operatorManager = {
      list: async () =>
        Result.ok([
          {
            id: "op_1234567890abcdef",
            config: {
              label: "alpha",
              role: "operator",
              scopeMode: "shared",
              provider: "internal",
            },
            createdAt: "2026-04-13T00:00:00.000Z",
            createdBy: "owner",
            status: "active",
          },
        ]),
      lookup: async () => Result.err(new Error("unused") as never),
      create: async () => Result.err(new Error("unused") as never),
      update: async () => Result.err(new Error("unused") as never),
      remove: async () => Result.err(new Error("unused") as never),
    };

    const actions = createLookupActions(
      buildDeps({ operatorManager: operatorManager as never }),
    );
    const spec = actions.find((action) => action.id === "lookup.resolve");
    expect(spec).toBeDefined();

    const result = await spec!.handler!({ query: "alpha" }, stubCtx());
    expect(Result.isOk(result)).toBe(true);
    if (Result.isError(result)) {
      throw new Error("lookup.resolve failed");
    }

    expect(result.value.operator).toEqual({
      id: "op_1234567890abcdef",
      label: "alpha",
      role: "operator",
      status: "active",
    });
    expect(result.value.found).toBe(true);
  });

  test("resolves a credential by ID", async () => {
    const credentialManager = {
      lookup: async () =>
        Result.ok({
          credentialId: "cred_1234567890abcdef",
          operatorId: "op_1234567890abcdef",
          config: {
            operatorId: "op_1234567890abcdef",
            chatIds: ["conv_1234567890abcdef"],
            policyId: "policy_1234567890abcdef",
          },
          inboxIds: [],
          status: "active",
          issuedAt: "2026-04-13T00:00:00.000Z",
          expiresAt: "2026-04-13T01:00:00.000Z",
          issuedBy: "owner",
          effectiveScopes: { allow: [], deny: [] },
          isExpired: false,
          lastHeartbeat: "2026-04-13T00:00:00.000Z",
        }),
    };

    const actions = createLookupActions(
      buildDeps({ credentialManager: credentialManager as never }),
    );
    const spec = actions.find((action) => action.id === "lookup.resolve");
    expect(spec).toBeDefined();

    const result = await spec!.handler!(
      { query: "cred_1234567890abcdef" },
      stubCtx(),
    );
    expect(Result.isOk(result)).toBe(true);
    if (Result.isError(result)) {
      throw new Error("lookup.resolve failed");
    }

    expect(result.value.credential).toEqual({
      id: "cred_1234567890abcdef",
      operatorId: "op_1234567890abcdef",
      policyId: "policy_1234567890abcdef",
      chatIds: ["conv_1234567890abcdef"],
      status: "active",
      expiresAt: "2026-04-13T01:00:00.000Z",
    });
  });

  test("returns an unfound result when nothing matches locally", async () => {
    const actions = createLookupActions(buildDeps());
    const spec = actions.find((action) => action.id === "lookup.resolve");
    expect(spec).toBeDefined();

    const result = await spec!.handler!({ query: "missing-value" }, stubCtx());
    expect(Result.isOk(result)).toBe(true);
    if (Result.isError(result)) {
      throw new Error("lookup.resolve failed");
    }

    expect(result.value).toEqual({
      query: "missing-value",
      found: false,
      mapping: null,
      inbox: null,
      operator: null,
      policy: null,
      credential: null,
    });
  });

  test("exposes a single idempotent read action", () => {
    const actions = createLookupActions(buildDeps());
    expect(actions).toHaveLength(1);
    expect(actions[0]?.id).toBe("lookup.resolve");
    expect(actions[0]?.intent).toBe("read");
    expect(actions[0]?.idempotent).toBe(true);
  });
});

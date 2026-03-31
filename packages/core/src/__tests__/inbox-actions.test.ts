import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { Result } from "better-result";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ActionSpec } from "@xmtp/signet-contracts";
import type { SignetError } from "@xmtp/signet-schemas";
import { createOperatorManager } from "../../../sessions/src/operator-manager.js";
import { createSqliteIdMappingStore } from "../id-mapping-store.js";
import { SqliteIdentityStore } from "../identity-store.js";
import { createInboxActions } from "../inbox-actions.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) =>
      rm(dir, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

function findAction<TInput, TOutput>(
  actions: ActionSpec<unknown, unknown, SignetError>[],
  id: string,
): ActionSpec<TInput, TOutput, SignetError> {
  const action = actions.find((spec) => spec.id === id);
  expect(action).toBeDefined();
  return action as ActionSpec<TInput, TOutput, SignetError>;
}

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "xmtp-signet-inbox-actions-"));
  tempDirs.push(dir);
  return new SqliteIdentityStore(join(dir, "identities.db"));
}

describe("createInboxActions", () => {
  test("inbox.create registers an inbox, stores a mapping, and auto-links to an operator", async () => {
    const identityStore = await createStore();
    const operatorManager = createOperatorManager();
    const idMappings = createSqliteIdMappingStore(new Database(":memory:"));
    const operator = await operatorManager.create({
      label: "alpha",
      role: "operator",
      scopeMode: "shared",
      provider: "internal",
    });
    expect(Result.isOk(operator)).toBe(true);
    if (Result.isError(operator)) {
      throw new Error("operator.create failed");
    }

    const actions = createInboxActions({
      identityStore,
      operatorManager,
      idMappings,
      registerInbox: async ({ label }) => {
        const created = await identityStore.create(null, label);
        if (Result.isError(created)) {
          return created;
        }
        await identityStore.setInboxId(created.value.id, "xmtp-inbox-1");
        return Result.ok({
          identityId: created.value.id,
          inboxId: "xmtp-inbox-1",
          address: "0xabc123",
          env: "dev",
          label,
        });
      },
      cleanupInbox: async () => Result.ok(["stop client", "delete db"]),
    });

    const create = findAction<
      { label?: string; operatorId?: string },
      {
        id: string;
        networkInboxId: string | null;
        label: string | null;
        operatorId: string | null;
      }
    >(actions, "inbox.create");

    const result = await create.handler({
      label: "support",
      operatorId: operator.value.id,
    });

    expect(Result.isOk(result)).toBe(true);
    if (Result.isError(result)) {
      throw new Error("inbox.create failed");
    }

    expect(result.value.id).toMatch(/^inbox_[a-f0-9]{16}$/);
    expect(result.value.networkInboxId).toBe("xmtp-inbox-1");
    expect(result.value.label).toBe("support");
    expect(result.value.operatorId).toBe(operator.value.id);
    expect(idMappings.getNetwork(result.value.id)).toBe("xmtp-inbox-1");

    const updatedOperator = await operatorManager.lookup(operator.value.id);
    expect(Result.isOk(updatedOperator)).toBe(true);
    if (Result.isError(updatedOperator)) {
      throw new Error("operator.lookup failed");
    }
    expect(updatedOperator.value.config.inboxIds).toEqual([result.value.id]);
  });

  test("inbox.list and inbox.info include linked operator metadata", async () => {
    const identityStore = await createStore();
    const operatorManager = createOperatorManager();
    const operator = await operatorManager.create({
      label: "alpha",
      role: "operator",
      scopeMode: "shared",
      provider: "internal",
      inboxIds: ["inbox_abcd1234feedbabe"],
    });
    expect(Result.isOk(operator)).toBe(true);
    if (Result.isError(operator)) {
      throw new Error("operator.create failed");
    }

    const created = await identityStore.create(null, "support");
    expect(Result.isOk(created)).toBe(true);
    if (Result.isError(created)) {
      throw new Error("identityStore.create failed");
    }
    await identityStore.setInboxId(created.value.id, "xmtp-inbox-2");

    const link = await operatorManager.update(operator.value.id, {
      inboxIds: [created.value.id],
    });
    expect(Result.isOk(link)).toBe(true);

    const actions = createInboxActions({
      identityStore,
      operatorManager,
      registerInbox: async () => {
        throw new Error("unused");
      },
      cleanupInbox: async () => Result.ok([]),
    });

    const list = findAction<
      Record<string, never>,
      readonly { id: string; operatorId: string | null }[]
    >(actions, "inbox.list");
    const info = findAction<
      { inboxId: string },
      { id: string; operatorId: string | null; networkInboxId: string | null }
    >(actions, "inbox.info");

    const listed = await list.handler({});
    expect(Result.isOk(listed)).toBe(true);
    if (Result.isError(listed)) {
      throw new Error("inbox.list failed");
    }

    expect(listed.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.value.id,
          operatorId: operator.value.id,
        }),
      ]),
    );

    const detailed = await info.handler({ inboxId: created.value.id });
    expect(Result.isOk(detailed)).toBe(true);
    if (Result.isError(detailed)) {
      throw new Error("inbox.info failed");
    }

    expect(detailed.value.id).toBe(created.value.id);
    expect(detailed.value.operatorId).toBe(operator.value.id);
    expect(detailed.value.networkInboxId).toBe("xmtp-inbox-2");
  });

  test("inbox.link, inbox.unlink, and inbox.rm update operator links and local state", async () => {
    const identityStore = await createStore();
    const operatorManager = createOperatorManager();
    const idMappings = createSqliteIdMappingStore(new Database(":memory:"));
    const cleanupCalls: Array<{ id: string; execute: boolean }> = [];

    const operator = await operatorManager.create({
      label: "alpha",
      role: "operator",
      scopeMode: "shared",
      provider: "internal",
    });
    expect(Result.isOk(operator)).toBe(true);
    if (Result.isError(operator)) {
      throw new Error("operator.create failed");
    }

    const created = await identityStore.create(null, "support");
    expect(Result.isOk(created)).toBe(true);
    if (Result.isError(created)) {
      throw new Error("identityStore.create failed");
    }
    await identityStore.setInboxId(created.value.id, "xmtp-inbox-3");
    idMappings.set("xmtp-inbox-3", created.value.id, "inbox");

    const actions = createInboxActions({
      identityStore,
      operatorManager,
      idMappings,
      registerInbox: async () => {
        throw new Error("unused");
      },
      cleanupInbox: async (identity, execute) => {
        cleanupCalls.push({ id: identity.id, execute });
        return Result.ok(["stop client", "delete db"]);
      },
    });

    const link = findAction<
      { inboxId: string; operatorId: string },
      { id: string; operatorId: string | null }
    >(actions, "inbox.link");
    const unlink = findAction<
      { inboxId: string },
      { id: string; operatorId: string | null }
    >(actions, "inbox.unlink");
    const remove = findAction<
      { inboxId: string; execute?: boolean },
      { executed: boolean; actions: readonly string[] }
    >(actions, "inbox.rm");

    const linked = await link.handler({
      inboxId: created.value.id,
      operatorId: operator.value.id,
    });
    expect(Result.isOk(linked)).toBe(true);
    if (Result.isError(linked)) {
      throw new Error("inbox.link failed");
    }
    expect(linked.value.operatorId).toBe(operator.value.id);

    const dryRun = await remove.handler({ inboxId: created.value.id });
    expect(Result.isOk(dryRun)).toBe(true);
    if (Result.isError(dryRun)) {
      throw new Error("inbox.rm dry-run failed");
    }
    expect(dryRun.value.executed).toBe(false);
    expect(dryRun.value.actions).toEqual(
      expect.arrayContaining([
        `unlink operator ${operator.value.id}`,
        `remove inbox ${created.value.id}`,
        "remove id mapping",
        "stop client",
        "delete db",
      ]),
    );

    const unlinked = await unlink.handler({ inboxId: created.value.id });
    expect(Result.isOk(unlinked)).toBe(true);
    if (Result.isError(unlinked)) {
      throw new Error("inbox.unlink failed");
    }
    expect(unlinked.value.operatorId).toBeNull();

    const relinked = await link.handler({
      inboxId: created.value.id,
      operatorId: operator.value.id,
    });
    expect(Result.isOk(relinked)).toBe(true);

    const removed = await remove.handler({
      inboxId: created.value.id,
      execute: true,
    });
    expect(Result.isOk(removed)).toBe(true);
    if (Result.isError(removed)) {
      throw new Error("inbox.rm failed");
    }
    expect(removed.value.executed).toBe(true);
    expect(cleanupCalls).toEqual([
      { id: created.value.id, execute: false },
      { id: created.value.id, execute: true },
    ]);
    expect(await identityStore.getById(created.value.id)).toBeNull();
    expect(idMappings.resolve(created.value.id)).toBeNull();

    const updatedOperator = await operatorManager.lookup(operator.value.id);
    expect(Result.isOk(updatedOperator)).toBe(true);
    if (Result.isError(updatedOperator)) {
      throw new Error("operator.lookup failed");
    }
    expect(updatedOperator.value.config.inboxIds).toBeUndefined();
  });
});

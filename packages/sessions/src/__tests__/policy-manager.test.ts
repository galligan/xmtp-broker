import { describe, expect, test, beforeEach } from "bun:test";
import type { PolicyConfigType } from "@xmtp/signet-schemas";
import { NotFoundError, ValidationError } from "@xmtp/signet-schemas";
import {
  createPolicyManager,
  type PolicyManagerInternal,
} from "../policy-manager.js";
import type { PolicyManager } from "@xmtp/signet-contracts";

function makeConfig(
  overrides: Partial<PolicyConfigType> = {},
): PolicyConfigType {
  return {
    label: "Test Policy",
    allow: ["send", "reply"],
    deny: ["remove-member"],
    ...overrides,
  };
}

let manager: PolicyManager & PolicyManagerInternal;

beforeEach(() => {
  manager = createPolicyManager();
});

describe("createPolicyManager", () => {
  describe("create", () => {
    test("returns a record with policy_ prefix ID", async () => {
      const result = await manager.create(makeConfig());
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) return;
      expect(result.value.id).toMatch(/^policy_[0-9a-f]{16}$/);
    });

    test("stores config fields in the record", async () => {
      const config = makeConfig({
        label: "Custom",
        allow: ["send"],
        deny: ["react"],
      });
      const result = await manager.create(config);
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) return;
      expect(result.value.config.label).toBe("Custom");
      expect(result.value.config.allow).toEqual(["send"]);
      expect(result.value.config.deny).toEqual(["react"]);
    });

    test("sets valid ISO 8601 timestamps", async () => {
      const before = new Date();
      const result = await manager.create(makeConfig());
      const after = new Date();
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) return;
      const created = new Date(result.value.createdAt);
      const updated = new Date(result.value.updatedAt);
      expect(created.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(created.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(updated.getTime()).toBe(created.getTime());
    });

    test("returns ValidationError for empty label", async () => {
      const result = await manager.create(makeConfig({ label: "" }));
      expect(result.isErr()).toBe(true);
      if (!result.isErr()) return;
      expect(result.error).toBeInstanceOf(ValidationError);
    });

    test("increments size after creation", async () => {
      expect(manager.size).toBe(0);
      await manager.create(makeConfig());
      expect(manager.size).toBe(1);
    });
  });

  describe("list", () => {
    test("returns empty array when no policies exist", async () => {
      const result = await manager.list();
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) return;
      expect(result.value).toEqual([]);
    });

    test("returns all policies", async () => {
      await manager.create(makeConfig({ label: "A" }));
      await manager.create(makeConfig({ label: "B" }));
      const result = await manager.list();
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) return;
      expect(result.value).toHaveLength(2);
    });
  });

  describe("lookup", () => {
    test("returns policy by ID", async () => {
      const createResult = await manager.create(makeConfig({ label: "Found" }));
      expect(createResult.isOk()).toBe(true);
      if (!createResult.isOk()) return;
      const lookupResult = await manager.lookup(createResult.value.id);
      expect(lookupResult.isOk()).toBe(true);
      if (!lookupResult.isOk()) return;
      expect(lookupResult.value.config.label).toBe("Found");
    });

    test("returns NotFoundError for unknown ID", async () => {
      const result = await manager.lookup("policy_00000000feedbabe");
      expect(result.isErr()).toBe(true);
      if (!result.isErr()) return;
      expect(result.error).toBeInstanceOf(NotFoundError);
    });
  });

  describe("update", () => {
    test("updates allow and deny scopes", async () => {
      const createResult = await manager.create(makeConfig());
      expect(createResult.isOk()).toBe(true);
      if (!createResult.isOk()) return;
      const updateResult = await manager.update(createResult.value.id, {
        allow: ["react"],
        deny: ["send"],
      });
      expect(updateResult.isOk()).toBe(true);
      if (!updateResult.isOk()) return;
      expect(updateResult.value.config.allow).toEqual(["react"]);
      expect(updateResult.value.config.deny).toEqual(["send"]);
    });

    test("updates label", async () => {
      const createResult = await manager.create(makeConfig({ label: "Old" }));
      expect(createResult.isOk()).toBe(true);
      if (!createResult.isOk()) return;
      const updateResult = await manager.update(createResult.value.id, {
        label: "New",
      });
      expect(updateResult.isOk()).toBe(true);
      if (!updateResult.isOk()) return;
      expect(updateResult.value.config.label).toBe("New");
    });

    test("advances updatedAt timestamp", async () => {
      const createResult = await manager.create(makeConfig());
      expect(createResult.isOk()).toBe(true);
      if (!createResult.isOk()) return;
      const originalUpdatedAt = createResult.value.updatedAt;
      // Small delay to ensure timestamp differs
      await new Promise((resolve) => setTimeout(resolve, 5));
      const updateResult = await manager.update(createResult.value.id, {
        label: "Changed",
      });
      expect(updateResult.isOk()).toBe(true);
      if (!updateResult.isOk()) return;
      expect(new Date(updateResult.value.updatedAt).getTime()).toBeGreaterThan(
        new Date(originalUpdatedAt).getTime(),
      );
    });

    test("returns NotFoundError for unknown ID", async () => {
      const result = await manager.update("policy_00000000feedbabe", {
        label: "X",
      });
      expect(result.isErr()).toBe(true);
      if (!result.isErr()) return;
      expect(result.error).toBeInstanceOf(NotFoundError);
    });

    test("returns ValidationError for empty label update", async () => {
      const createResult = await manager.create(makeConfig());
      expect(createResult.isOk()).toBe(true);
      if (!createResult.isOk()) return;
      const updateResult = await manager.update(createResult.value.id, {
        label: "",
      });
      expect(updateResult.isErr()).toBe(true);
      if (!updateResult.isErr()) return;
      expect(updateResult.error).toBeInstanceOf(ValidationError);
    });
  });

  describe("remove", () => {
    test("deletes policy from store", async () => {
      const createResult = await manager.create(makeConfig());
      expect(createResult.isOk()).toBe(true);
      if (!createResult.isOk()) return;
      const removeResult = await manager.remove(createResult.value.id);
      expect(removeResult.isOk()).toBe(true);
      const lookupResult = await manager.lookup(createResult.value.id);
      expect(lookupResult.isErr()).toBe(true);
      if (!lookupResult.isErr()) return;
      expect(lookupResult.error).toBeInstanceOf(NotFoundError);
    });

    test("returns NotFoundError for unknown ID", async () => {
      const result = await manager.remove("policy_00000000feedbabe");
      expect(result.isErr()).toBe(true);
      if (!result.isErr()) return;
      expect(result.error).toBeInstanceOf(NotFoundError);
    });

    test("decrements size after removal", async () => {
      const createResult = await manager.create(makeConfig());
      expect(createResult.isOk()).toBe(true);
      if (!createResult.isOk()) return;
      expect(manager.size).toBe(1);
      await manager.remove(createResult.value.id);
      expect(manager.size).toBe(0);
    });
  });
});

import { describe, expect, it } from "bun:test";
import {
  ScopeCategory,
  PermissionScope,
  SCOPES_BY_CATEGORY,
  ScopeSet,
  resolveScopeSet,
  isScopeAllowed,
  isScopeInCategory,
} from "../permission-scopes.js";
import type {
  ScopeCategoryType,
  PermissionScopeType,
  ScopeSetType,
} from "../permission-scopes.js";

describe("ScopeCategory", () => {
  it("accepts all six category names", () => {
    const categories = [
      "messaging",
      "group-management",
      "metadata",
      "access",
      "observation",
      "egress",
    ];
    for (const cat of categories) {
      expect(ScopeCategory.safeParse(cat).success).toBe(true);
    }
  });

  it("rejects unknown categories", () => {
    expect(ScopeCategory.safeParse("admin").success).toBe(false);
    expect(ScopeCategory.safeParse("").success).toBe(false);
  });
});

describe("PermissionScope", () => {
  it("accepts all 30 scope strings", () => {
    const scopes = [
      "send",
      "reply",
      "react",
      "read-receipt",
      "attachment",
      "add-member",
      "remove-member",
      "promote-admin",
      "demote-admin",
      "update-permission",
      "update-name",
      "update-description",
      "update-image",
      "invite",
      "join",
      "leave",
      "create-group",
      "create-dm",
      "read-messages",
      "read-history",
      "list-members",
      "list-conversations",
      "read-permissions",
      "stream-messages",
      "stream-conversations",
      "forward-to-provider",
      "store-excerpts",
      "use-for-memory",
      "quote-revealed",
      "summarize",
    ];
    expect(scopes).toHaveLength(30);
    for (const scope of scopes) {
      expect(PermissionScope.safeParse(scope).success).toBe(true);
    }
  });

  it("rejects unknown scopes", () => {
    expect(PermissionScope.safeParse("admin").success).toBe(false);
    expect(PermissionScope.safeParse("").success).toBe(false);
  });
});

describe("SCOPES_BY_CATEGORY", () => {
  it("contains all six categories", () => {
    const keys = Object.keys(SCOPES_BY_CATEGORY);
    expect(keys).toHaveLength(6);
    expect(keys).toContain("messaging");
    expect(keys).toContain("group-management");
    expect(keys).toContain("metadata");
    expect(keys).toContain("access");
    expect(keys).toContain("observation");
    expect(keys).toContain("egress");
  });

  it("maps messaging to its 5 scopes", () => {
    expect(SCOPES_BY_CATEGORY["messaging"]).toEqual([
      "send",
      "reply",
      "react",
      "read-receipt",
      "attachment",
    ]);
  });

  it("maps group-management to its 5 scopes", () => {
    expect(SCOPES_BY_CATEGORY["group-management"]).toEqual([
      "add-member",
      "remove-member",
      "promote-admin",
      "demote-admin",
      "update-permission",
    ]);
  });

  it("maps observation to its 7 scopes", () => {
    expect(SCOPES_BY_CATEGORY["observation"]).toHaveLength(7);
  });

  it("contains exactly 30 scopes total", () => {
    const allScopes = Object.values(SCOPES_BY_CATEGORY).flat();
    expect(allScopes).toHaveLength(30);
  });

  it("has no duplicate scopes across categories", () => {
    const allScopes = Object.values(SCOPES_BY_CATEGORY).flat();
    const unique = new Set(allScopes);
    expect(unique.size).toBe(allScopes.length);
  });
});

describe("ScopeSet", () => {
  it("accepts valid allow/deny arrays", () => {
    const valid: ScopeSetType = {
      allow: ["send", "reply"],
      deny: ["react"],
    };
    expect(ScopeSet.safeParse(valid).success).toBe(true);
  });

  it("accepts empty arrays", () => {
    const valid: ScopeSetType = { allow: [], deny: [] };
    expect(ScopeSet.safeParse(valid).success).toBe(true);
  });

  it("rejects invalid scope strings in allow", () => {
    expect(ScopeSet.safeParse({ allow: ["bogus"], deny: [] }).success).toBe(
      false,
    );
  });

  it("rejects invalid scope strings in deny", () => {
    expect(ScopeSet.safeParse({ allow: [], deny: ["bogus"] }).success).toBe(
      false,
    );
  });

  it("rejects missing fields", () => {
    expect(ScopeSet.safeParse({ allow: ["send"] }).success).toBe(false);
    expect(ScopeSet.safeParse({ deny: ["send"] }).success).toBe(false);
  });
});

describe("resolveScopeSet", () => {
  it("returns allowed scopes not in deny", () => {
    const resolved = resolveScopeSet({
      allow: ["send", "reply", "react"],
      deny: ["react"],
    });
    expect(resolved).toEqual(new Set(["send", "reply"]));
  });

  it("returns empty set when all allowed are denied", () => {
    const resolved = resolveScopeSet({
      allow: ["send"],
      deny: ["send"],
    });
    expect(resolved.size).toBe(0);
  });

  it("returns empty set for empty allow", () => {
    const resolved = resolveScopeSet({ allow: [], deny: [] });
    expect(resolved.size).toBe(0);
  });

  it("deny has no effect for scopes not in allow", () => {
    const resolved = resolveScopeSet({
      allow: ["send"],
      deny: ["reply"],
    });
    expect(resolved).toEqual(new Set(["send"]));
  });
});

describe("isScopeAllowed", () => {
  it("returns true for a scope in the resolved set", () => {
    const resolved = new Set<string>(["send", "reply"]);
    expect(isScopeAllowed("send", resolved)).toBe(true);
  });

  it("returns false for a scope not in the resolved set", () => {
    const resolved = new Set<string>(["send"]);
    expect(isScopeAllowed("reply", resolved)).toBe(false);
  });

  it("returns false for an empty resolved set", () => {
    expect(isScopeAllowed("send", new Set())).toBe(false);
  });
});

describe("isScopeInCategory", () => {
  it("returns true when scope belongs to category", () => {
    expect(isScopeInCategory("send", "messaging")).toBe(true);
    expect(isScopeInCategory("add-member", "group-management")).toBe(true);
    expect(isScopeInCategory("update-name", "metadata")).toBe(true);
    expect(isScopeInCategory("invite", "access")).toBe(true);
    expect(isScopeInCategory("read-messages", "observation")).toBe(true);
    expect(isScopeInCategory("summarize", "egress")).toBe(true);
  });

  it("returns false when scope does not belong to category", () => {
    expect(isScopeInCategory("send", "egress")).toBe(false);
    expect(isScopeInCategory("summarize", "messaging")).toBe(false);
  });
});

describe("type exports", () => {
  it("ScopeCategoryType is assignable from valid category", () => {
    const cat: ScopeCategoryType = "messaging";
    expect(cat).toBe("messaging");
  });

  it("PermissionScopeType is assignable from valid scope", () => {
    const scope: PermissionScopeType = "send";
    expect(scope).toBe("send");
  });

  it("ScopeSetType is assignable from valid object", () => {
    const set: ScopeSetType = { allow: ["send"], deny: [] };
    expect(set.allow).toHaveLength(1);
  });
});

import { describe, expect, test } from "bun:test";
import {
  ContentTypeProfileSnapshot,
  ContentTypeProfileUpdate,
  MemberKind,
  decodeProfileSnapshot,
  decodeProfileUpdate,
  encodeProfileSnapshot,
  encodeProfileUpdate,
} from "../profile-messages.js";

describe("profile-messages", () => {
  test("round-trips a profile update", () => {
    const encoded = encodeProfileUpdate({
      name: "Codex",
      memberKind: MemberKind.Agent,
      metadata: {
        trusted: { type: "bool", value: true },
      },
    });

    const decoded = decodeProfileUpdate(encoded);

    expect(encoded.type).toEqual(ContentTypeProfileUpdate);
    expect(decoded.name).toBe("Codex");
    expect(decoded.memberKind).toBe(MemberKind.Agent);
    expect(decoded.metadata?.["trusted"]).toEqual({
      type: "bool",
      value: true,
    });
  });

  test("round-trips a profile snapshot", () => {
    const encoded = encodeProfileSnapshot({
      profiles: [
        {
          inboxId: "aa".repeat(32),
          name: "Codex",
          memberKind: MemberKind.Agent,
        },
      ],
    });

    const decoded = decodeProfileSnapshot(encoded);

    expect(encoded.type).toEqual(ContentTypeProfileSnapshot);
    expect(decoded.profiles).toHaveLength(1);
    expect(decoded.profiles[0]).toMatchObject({
      inboxId: "aa".repeat(32),
      name: "Codex",
      memberKind: MemberKind.Agent,
    });
  });
});

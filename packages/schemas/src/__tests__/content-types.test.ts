import { describe, expect, it } from "bun:test";
import {
  ContentTypeId,
  BASELINE_CONTENT_TYPES,
  TextPayload,
  ReactionPayload,
  ReplyPayload,
  ReadReceiptPayload,
  GroupUpdatedPayload,
  CONTENT_TYPE_SCHEMAS,
} from "../content-types.js";

describe("ContentTypeId", () => {
  it("accepts valid XMTP content type strings", () => {
    expect(ContentTypeId.safeParse("xmtp.org/text:1.0").success).toBe(true);
    expect(ContentTypeId.safeParse("xmtp.org/reaction:1.0").success).toBe(true);
    expect(ContentTypeId.safeParse("xmtp.org/readReceipt:1.0").success).toBe(
      true,
    );
    expect(ContentTypeId.safeParse("custom.org/myType:2.1").success).toBe(true);
  });

  it("rejects malformed content type strings", () => {
    expect(ContentTypeId.safeParse("invalid").success).toBe(false);
    expect(ContentTypeId.safeParse("xmtp.org/text").success).toBe(false);
    expect(ContentTypeId.safeParse("text:1.0").success).toBe(false);
    expect(ContentTypeId.safeParse("").success).toBe(false);
    expect(ContentTypeId.safeParse("xmtp.org/text:1").success).toBe(false);
    expect(ContentTypeId.safeParse("XMTP.ORG/text:1.0").success).toBe(false);
  });
});

describe("BASELINE_CONTENT_TYPES", () => {
  it("contains exactly 5 standard content types", () => {
    expect(BASELINE_CONTENT_TYPES).toHaveLength(5);
  });

  it("includes all standard XMTP types", () => {
    expect(BASELINE_CONTENT_TYPES).toContain("xmtp.org/text:1.0");
    expect(BASELINE_CONTENT_TYPES).toContain("xmtp.org/reaction:1.0");
    expect(BASELINE_CONTENT_TYPES).toContain("xmtp.org/reply:1.0");
    expect(BASELINE_CONTENT_TYPES).toContain("xmtp.org/readReceipt:1.0");
    expect(BASELINE_CONTENT_TYPES).toContain("xmtp.org/groupUpdated:1.0");
  });

  it("all entries are valid ContentTypeId values", () => {
    for (const ct of BASELINE_CONTENT_TYPES) {
      expect(ContentTypeId.safeParse(ct).success).toBe(true);
    }
  });
});

describe("TextPayload", () => {
  it("accepts valid text payload", () => {
    expect(TextPayload.safeParse({ text: "hello" }).success).toBe(true);
  });

  it("rejects empty text", () => {
    expect(TextPayload.safeParse({ text: "" }).success).toBe(false);
  });

  it("rejects missing text field", () => {
    expect(TextPayload.safeParse({}).success).toBe(false);
  });
});

describe("ReactionPayload", () => {
  it("accepts valid reaction payload", () => {
    const valid = {
      reference: "msg-123",
      action: "added",
      content: "thumbsup",
      schema: "unicode",
    };
    expect(ReactionPayload.safeParse(valid).success).toBe(true);
  });

  it("rejects invalid action", () => {
    const invalid = {
      reference: "msg-123",
      action: "unknown",
      content: "thumbsup",
      schema: "unicode",
    };
    expect(ReactionPayload.safeParse(invalid).success).toBe(false);
  });

  it("rejects invalid schema type", () => {
    const invalid = {
      reference: "msg-123",
      action: "added",
      content: "thumbsup",
      schema: "invalid",
    };
    expect(ReactionPayload.safeParse(invalid).success).toBe(false);
  });
});

describe("ReplyPayload", () => {
  it("accepts valid reply payload", () => {
    const valid = {
      reference: "msg-456",
      content: {
        type: "xmtp.org/text:1.0",
        payload: { text: "reply text" },
      },
    };
    expect(ReplyPayload.safeParse(valid).success).toBe(true);
  });

  it("rejects reply with invalid content type", () => {
    const invalid = {
      reference: "msg-456",
      content: {
        type: "invalid",
        payload: { text: "reply" },
      },
    };
    expect(ReplyPayload.safeParse(invalid).success).toBe(false);
  });
});

describe("ReadReceiptPayload", () => {
  it("accepts empty object", () => {
    expect(ReadReceiptPayload.safeParse({}).success).toBe(true);
  });
});

describe("GroupUpdatedPayload", () => {
  it("accepts valid group update payload", () => {
    const valid = {
      initiatedByInboxId: "inbox-1",
      addedInboxes: ["inbox-2"],
      removedInboxes: [],
      metadataFieldsChanged: [
        { fieldName: "name", oldValue: "Old", newValue: "New" },
      ],
    };
    expect(GroupUpdatedPayload.safeParse(valid).success).toBe(true);
  });

  it("accepts null values for metadata old/new values", () => {
    const valid = {
      initiatedByInboxId: "inbox-1",
      addedInboxes: [],
      removedInboxes: [],
      metadataFieldsChanged: [
        { fieldName: "desc", oldValue: null, newValue: "set" },
      ],
    };
    expect(GroupUpdatedPayload.safeParse(valid).success).toBe(true);
  });

  it("rejects undefined for metadata values (must be nullable)", () => {
    const invalid = {
      initiatedByInboxId: "inbox-1",
      addedInboxes: [],
      removedInboxes: [],
      metadataFieldsChanged: [{ fieldName: "desc", newValue: "set" }],
    };
    expect(GroupUpdatedPayload.safeParse(invalid).success).toBe(false);
  });
});

describe("CONTENT_TYPE_SCHEMAS", () => {
  it("has entries for all baseline content types", () => {
    for (const ct of BASELINE_CONTENT_TYPES) {
      expect(CONTENT_TYPE_SCHEMAS[ct]).toBeDefined();
    }
  });
});

import { describe, expect, it } from "bun:test";
import {
  RequestSuccess,
  RequestFailure,
  RequestResponse,
} from "../response.js";

describe("RequestSuccess", () => {
  it("accepts valid success response", () => {
    const valid = {
      ok: true,
      requestId: "req-1",
      data: { messageId: "msg-1" },
    };
    expect(RequestSuccess.safeParse(valid).success).toBe(true);
  });

  it("rejects ok: false", () => {
    const invalid = {
      ok: false,
      requestId: "req-1",
      data: {},
    };
    expect(RequestSuccess.safeParse(invalid).success).toBe(false);
  });
});

describe("RequestFailure", () => {
  it("accepts valid failure response", () => {
    const valid = {
      ok: false,
      requestId: "req-1",
      error: {
        code: 1000,
        category: "validation",
        message: "Invalid input",
        context: { field: "groupId" },
      },
    };
    expect(RequestFailure.safeParse(valid).success).toBe(true);
  });

  it("accepts null context", () => {
    const valid = {
      ok: false,
      requestId: "req-1",
      error: {
        code: 1400,
        category: "internal",
        message: "Unexpected error",
        context: null,
      },
    };
    expect(RequestFailure.safeParse(valid).success).toBe(true);
  });

  it("rejects ok: true", () => {
    const invalid = {
      ok: true,
      requestId: "req-1",
      error: {
        code: 1000,
        category: "validation",
        message: "Invalid",
        context: null,
      },
    };
    expect(RequestFailure.safeParse(invalid).success).toBe(false);
  });

  it("rejects unsupported error categories", () => {
    const invalid = {
      ok: false,
      requestId: "req-1",
      error: {
        code: 1000,
        category: "permision",
        message: "Invalid input",
        context: null,
      },
    };
    expect(RequestFailure.safeParse(invalid).success).toBe(false);
  });
});

describe("RequestResponse discriminated union", () => {
  it("discriminates on ok field", () => {
    const success = {
      ok: true,
      requestId: "req-1",
      data: null,
    };
    const result = RequestResponse.safeParse(success);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ok).toBe(true);
    }
  });

  it("parses failure correctly", () => {
    const failure = {
      ok: false,
      requestId: "req-1",
      error: {
        code: 1100,
        category: "not_found",
        message: "Not found",
        context: null,
      },
    };
    const result = RequestResponse.safeParse(failure);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ok).toBe(false);
    }
  });
});

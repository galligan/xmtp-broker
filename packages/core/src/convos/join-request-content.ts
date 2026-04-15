export interface ConvosContentTypeId {
  readonly authorityId: string;
  readonly typeId: string;
  readonly versionMajor: number;
  readonly versionMinor: number;
}

export interface EncodedConvosContent {
  readonly type: ConvosContentTypeId;
  readonly parameters: Record<string, string>;
  readonly content: Uint8Array;
  readonly fallback?: string;
}

export const ContentTypeJoinRequest: ConvosContentTypeId = {
  authorityId: "convos.org",
  typeId: "join_request",
  versionMajor: 1,
  versionMinor: 0,
};

export interface JoinRequestProfile {
  readonly name?: string;
  readonly imageURL?: string;
  readonly memberKind?: string;
}

export interface JoinRequestContent {
  readonly inviteSlug: string;
  readonly profile?: JoinRequestProfile;
  readonly metadata?: Record<string, string>;
}

function isEncodedConvosContent(value: unknown): value is EncodedConvosContent {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as Record<string, unknown>;
  const type = candidate["type"];
  const content = candidate["content"];

  return (
    typeof type === "object" &&
    type !== null &&
    content instanceof Uint8Array &&
    typeof (type as Record<string, unknown>)["authorityId"] === "string" &&
    typeof (type as Record<string, unknown>)["typeId"] === "string"
  );
}

function isJoinRequestShape(value: unknown): value is JoinRequestContent {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>)["inviteSlug"] === "string"
  );
}

export function decodeJoinRequest(
  encoded: Pick<EncodedConvosContent, "content">,
): JoinRequestContent {
  const json = new TextDecoder().decode(encoded.content);
  const parsed = JSON.parse(json) as unknown;
  if (!isJoinRequestShape(parsed)) {
    throw new Error("Missing inviteSlug in JoinRequest");
  }
  return parsed;
}

export function extractJoinRequestContent(
  value: unknown,
): JoinRequestContent | undefined {
  if (isJoinRequestShape(value)) {
    return value;
  }

  if (isEncodedConvosContent(value)) {
    try {
      return decodeJoinRequest(value);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export function isJoinRequestContentType(
  contentType: string | undefined,
): boolean {
  return (
    contentType === "join_request" ||
    contentType === "convos.org/join_request:1.0"
  );
}

export class JoinRequestCodec {
  get contentType(): ConvosContentTypeId {
    return ContentTypeJoinRequest;
  }

  encode(content: JoinRequestContent): EncodedConvosContent {
    return {
      type: ContentTypeJoinRequest,
      parameters: {},
      content: new TextEncoder().encode(JSON.stringify(content)),
      fallback: content.inviteSlug,
    };
  }

  decode(content: EncodedConvosContent): JoinRequestContent {
    return decodeJoinRequest(content);
  }

  fallback(content: JoinRequestContent): string {
    return content.inviteSlug;
  }

  shouldPush(_content: JoinRequestContent): boolean {
    return true;
  }
}

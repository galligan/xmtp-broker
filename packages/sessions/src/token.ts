/**
 * Cryptographic token and session ID generation.
 *
 * Tokens are 32 random bytes, base64url-encoded (no padding) = 43 chars.
 * Session IDs are "ses_" + 16 random bytes, hex-encoded = 36 chars.
 */

/** Generate a cryptographically random session bearer token. */
export function generateToken(byteLength: number = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/** Generate a unique session ID with "ses_" prefix. */
export function generateSessionId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `ses_${hex}`;
}

/** Encode bytes as base64url without padding. */
function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

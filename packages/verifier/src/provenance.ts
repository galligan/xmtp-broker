import type {
  ProvenanceMapType,
  ClaimProvenanceRecordType,
} from "@xmtp/signet-schemas";
import type { VerificationStatement } from "./schemas/statement.js";

type DerivedProvenanceKey = "trustTier";

/**
 * Maps verifier check IDs to the provenance fields they can attest.
 *
 * When a check passes, the fields it covers are marked as `verified`
 * in the provenance map. Only checks that directly back a transparency
 * claim surfaced on the seal should map here.
 */
const CHECK_TO_PROVENANCE_FIELDS: Record<
  string,
  readonly DerivedProvenanceKey[]
> = {};

/**
 * Derives a provenance map from a verification statement.
 *
 * For each passing check that maps to provenance fields, a `verified`
 * record is created with the verifier's identity and the statement's
 * issuedAt timestamp. Today the only directly surfaced verifier-backed
 * claim is `trustTier`.
 *
 * This function is intended to be called by the signet after receiving
 * a verification statement, so the resulting map can be included in
 * the next seal published to the group.
 */
export function deriveProvenanceMap(
  statement: VerificationStatement,
): ProvenanceMapType {
  const map: ProvenanceMapType = {};

  const verifiedRecord: ClaimProvenanceRecordType = {
    source: "verified",
    attestedBy: statement.verifierInboxId,
    attestedAt: statement.issuedAt,
    expiresAt: statement.expiresAt,
  };

  // Map passing checks to provenance fields
  for (const check of statement.checks) {
    if (check.verdict !== "pass") continue;

    const fields = CHECK_TO_PROVENANCE_FIELDS[check.checkId];
    if (fields === undefined) continue;

    for (const field of fields) {
      map[field] = { ...verifiedRecord };
    }
  }

  // Trust tier is verified when above unverified
  if (statement.verifiedTier !== "unverified") {
    map["trustTier"] = { ...verifiedRecord };
  }

  return map;
}

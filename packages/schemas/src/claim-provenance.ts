import { z } from "zod";

// -- Types (declared first for isolatedDeclarations) -----------------------

/** Claim keys backed directly by operator-disclosed seal fields. */
export const OPERATOR_DISCLOSURE_PROVENANCE_KEYS = [
  "inferenceMode",
  "inferenceProviders",
  "contentEgressScope",
  "retentionAtProvider",
  "hostingMode",
] as const;

/** Claim keys backed by signet-established runtime evidence. */
export const EXTERNAL_PROVENANCE_KEYS = ["trustTier"] as const;

/** Every provenance key currently supported by the seal transparency model. */
export const SUPPORTED_PROVENANCE_KEYS = [
  "inferenceMode",
  "inferenceProviders",
  "contentEgressScope",
  "retentionAtProvider",
  "hostingMode",
  "trustTier",
] as const;

/** Union of supported provenance claim keys. */
export type SupportedProvenanceKeyType =
  (typeof SUPPORTED_PROVENANCE_KEYS)[number];

/**
 * How a seal claim's value was established.
 *
 * - `verified`: cryptographically proven or computed by the signet itself.
 *   No external trust required — math or the signet runtime guarantees it.
 * - `observed`: independently inspected by a signed, trusted component
 *   (e.g., a harness inspector plugin). Not self-reported, but not
 *   cryptographically proven either.
 * - `declared`: stated by the operator. The signet passes it through
 *   transparently without independent confirmation.
 */
export type ClaimProvenanceType = "verified" | "observed" | "declared";

/** Metadata about how a specific claim was established. */
export type ClaimProvenanceRecordType = {
  source: ClaimProvenanceType;
  /** Identity of the party that attested this claim (verifier ID, inspector ID). */
  attestedBy?: string | undefined;
  /** When the attestation was produced (ISO 8601). */
  attestedAt?: string | undefined;
  /** When this provenance record expires (ISO 8601). After this time, consumers should treat the claim as stale. */
  expiresAt?: string | undefined;
};

/** Map from supported seal claim names to their provenance records. */
export type ProvenanceMapType = Partial<
  Record<SupportedProvenanceKeyType, ClaimProvenanceRecordType>
>;

// -- Schemas ---------------------------------------------------------------

/**
 * How a seal claim's value was established.
 *
 * - `verified`: cryptographically proven or computed by the signet itself
 * - `observed`: independently inspected by a signed, trusted component
 * - `declared`: stated by the operator without independent confirmation
 */
export const ClaimProvenance: z.ZodEnum<["verified", "observed", "declared"]> =
  z.enum(["verified", "observed", "declared"]);

/** Metadata about how a specific claim was established. */
export const ClaimProvenanceRecord: z.ZodType<ClaimProvenanceRecordType> = z
  .object({
    /** How this claim was established. */
    source: ClaimProvenance,
    /** Identity of the attesting party (verifier ID, inspector ID). */
    attestedBy: z.string().optional(),
    /** When the attestation was produced (ISO 8601). */
    attestedAt: z.string().datetime().optional(),
    /** When this provenance expires (ISO 8601). Consumers should treat the claim as stale after this time. */
    expiresAt: z.string().datetime().optional(),
  })
  .describe("Provenance metadata for a seal claim");

/** Map from supported seal claim names to their provenance records. */
export const ProvenanceMap: z.ZodType<ProvenanceMapType> = z
  .record(z.string(), ClaimProvenanceRecord)
  .superRefine((value, ctx) => {
    for (const key of Object.keys(value)) {
      if (
        !SUPPORTED_PROVENANCE_KEYS.includes(key as SupportedProvenanceKeyType)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `Unsupported provenance key: ${key}`,
        });
      }
    }
  })
  .describe(
    "Maps supported seal claim names to provenance records indicating how each claim was established",
  );

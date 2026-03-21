import { Result } from "better-result";
import type { InternalError } from "@xmtp/signet-schemas";
import type { VerificationCheck } from "../schemas/check.js";
import type { VerificationRequest } from "../schemas/request.js";
import type { CheckHandler } from "./handler.js";
import { findMatchingSubject, parseSigstoreBundle } from "./sigstore-bundle.js";
import { extractP256PublicKey } from "./x509-key.js";
import { verifyDsseSignature } from "./dsse-verify.js";

/** Check ID for build provenance verification. */
export const BUILD_PROVENANCE_CHECK_ID = "build_provenance" as const;

import type { BuildProvenanceConfig } from "../config.js";

/**
 * Verifies the agent was built from the claimed source by parsing
 * and validating a Sigstore bundle. Checks:
 * - Bundle structural validity (DSSE envelope, verification material)
 * - DSSE signatures are present and non-empty
 * - In-toto statement validity
 * - Artifact digest match against statement subjects
 * - OIDC issuer and identity enforcement (when configured)
 * - Cryptographic DSSE signature verification (P-256 / SHA-256)
 */
export function createBuildProvenanceCheck(
  config?: BuildProvenanceConfig,
): CheckHandler {
  return {
    checkId: BUILD_PROVENANCE_CHECK_ID,

    async execute(
      request: VerificationRequest,
    ): Promise<Result<VerificationCheck, InternalError>> {
      if (request.buildProvenanceBundle === null) {
        return Result.ok({
          checkId: BUILD_PROVENANCE_CHECK_ID,
          verdict: "skip",
          reason: "No build provenance bundle provided",
          evidence: null,
        });
      }

      // Parse and validate bundle structure
      const parseResult = parseSigstoreBundle(request.buildProvenanceBundle);

      if (!parseResult.isOk()) {
        return Result.ok({
          checkId: BUILD_PROVENANCE_CHECK_ID,
          verdict: "fail",
          reason: parseResult.error,
          evidence: {
            bundlePresent: true,
            artifactDigest: request.artifactDigest,
          },
        });
      }

      const { statement, bundle, certificateRawBytes } = parseResult.value;

      // Verify DSSE signatures are present and non-empty
      const signatures = bundle.dsseEnvelope.signatures;
      const hasValidSignature = signatures.some(
        (s) => typeof s.sig === "string" && s.sig.length > 0,
      );
      if (!hasValidSignature) {
        return Result.ok({
          checkId: BUILD_PROVENANCE_CHECK_ID,
          verdict: "fail",
          reason: "DSSE envelope has no non-empty signatures",
          evidence: {
            signatureCount: signatures.length,
            allEmpty: true,
          },
        });
      }

      // Verify artifact digest matches a subject in the statement
      const matchingSubject = findMatchingSubject(
        statement,
        request.artifactDigest,
      );

      if (matchingSubject === null) {
        const statementDigests = statement.subject.map((s) => s.digest.sha256);
        return Result.ok({
          checkId: BUILD_PROVENANCE_CHECK_ID,
          verdict: "fail",
          reason:
            "Artifact digest does not match any subject in the in-toto statement",
          evidence: {
            expectedDigest: request.artifactDigest,
            statementDigests,
          },
        });
      }

      // Enforce OIDC issuer when configured
      if (config?.expectedOidcIssuer) {
        const predicate = statement.predicate as
          | {
              runDetails?: {
                metadata?: { oidcIssuer?: string };
              };
            }
          | undefined;
        const actualIssuer =
          predicate?.runDetails?.metadata?.oidcIssuer ?? null;
        if (actualIssuer !== config.expectedOidcIssuer) {
          return Result.ok({
            checkId: BUILD_PROVENANCE_CHECK_ID,
            verdict: "fail",
            reason: "OIDC issuer does not match expected value",
            evidence: {
              expectedIssuer: config.expectedOidcIssuer,
              actualIssuer,
            },
          });
        }
      }

      // Enforce identity pattern when configured
      if (config?.expectedIdentityPattern) {
        const predicate = statement.predicate as
          | {
              runDetails?: {
                metadata?: {
                  buildConfigSource?: { identity?: string };
                };
              };
            }
          | undefined;
        const actualIdentity =
          predicate?.runDetails?.metadata?.buildConfigSource?.identity ?? null;
        if (
          !actualIdentity ||
          !actualIdentity.startsWith(config.expectedIdentityPattern)
        ) {
          return Result.ok({
            checkId: BUILD_PROVENANCE_CHECK_ID,
            verdict: "fail",
            reason: "Build identity does not match expected pattern",
            evidence: {
              expectedPattern: config.expectedIdentityPattern,
              actualIdentity,
            },
          });
        }
      }

      // Cryptographic DSSE signature verification
      const keyResult = extractP256PublicKey(certificateRawBytes);
      if (!keyResult.isOk()) {
        return Result.ok({
          checkId: BUILD_PROVENANCE_CHECK_ID,
          verdict: "fail",
          reason: `Certificate key extraction failed: ${keyResult.error}`,
          evidence: {
            matchedSubject: matchingSubject.name,
            matchedDigest: matchingSubject.digest,
            certificateError: keyResult.error,
          },
        });
      }

      const verifyResult = verifyDsseSignature(bundle, keyResult.value);
      if (!verifyResult.isOk()) {
        return Result.ok({
          checkId: BUILD_PROVENANCE_CHECK_ID,
          verdict: "fail",
          reason: `DSSE signature verification failed: ${verifyResult.error}`,
          evidence: {
            matchedSubject: matchingSubject.name,
            matchedDigest: matchingSubject.digest,
            signatureError: verifyResult.error,
          },
        });
      }

      return Result.ok({
        checkId: BUILD_PROVENANCE_CHECK_ID,
        verdict: "skip",
        reason:
          "DSSE signature is cryptographically valid but Fulcio certificate chain and Rekor inclusion proof verification are not yet implemented",
        evidence: {
          matchedSubject: matchingSubject.name,
          matchedDigest: matchingSubject.digest,
          predicateType: statement.predicateType,
          hasCertificate: certificateRawBytes.length > 0,
          subjectCount: statement.subject.length,
          signatureCount: signatures.length,
          cryptoVerified: true,
        },
      });
    },
  };
}

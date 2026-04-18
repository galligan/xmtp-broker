import type { PolicyDelta } from "@xmtp/signet-contracts";

/** Narrow a single-or-array input into the array form used internally. */
function isDeltaArray(
  deltas: PolicyDelta | readonly PolicyDelta[],
): deltas is readonly PolicyDelta[] {
  return Array.isArray(deltas);
}

/** Normalize single-delta callers onto the shared batch evaluation path. */
function normalizeDeltas(
  deltas: PolicyDelta | readonly PolicyDelta[],
): readonly PolicyDelta[] {
  if (isDeltaArray(deltas)) {
    return deltas;
  }

  return [deltas];
}

/**
 * Classifies whether any delta in a set of policy changes is material
 * (triggers a new seal) or routine (silent).
 */
export function isMaterialChange(
  deltas: PolicyDelta | readonly PolicyDelta[],
): boolean {
  return normalizeDeltas(deltas).some((delta) => isSingleDeltaMaterial(delta));
}

/** Any added, removed, or flipped scope is material because the seal changes. */
function isSingleDeltaMaterial(delta: PolicyDelta): boolean {
  return (
    delta.added.length > 0 ||
    delta.removed.length > 0 ||
    delta.changed.length > 0
  );
}

/**
 * Classifies whether any delta in a set of policy changes requires
 * credential reauthorization (privilege escalation).
 */
export function requiresReauthorization(
  deltas: PolicyDelta | readonly PolicyDelta[],
): boolean {
  return normalizeDeltas(deltas).some((delta) =>
    isSingleDeltaEscalation(delta),
  );
}

/**
 * Reauthorization is only required when privileges expand: newly added scopes
 * or deny-to-allow flips. Pure restriction changes stay silent.
 */
function isSingleDeltaEscalation(delta: PolicyDelta): boolean {
  return (
    delta.added.length > 0 ||
    delta.changed.some((change) => change.to === "allow")
  );
}

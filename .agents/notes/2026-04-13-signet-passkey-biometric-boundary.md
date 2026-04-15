# Signet-Native Passkey / Biometric Boundary

Date: 2026-04-13
Issue: #121

## Main conclusion

The near-term path should be framed as **signet-native biometric approval with
Apple-first Secure Enclave backing**, not as a generic passkey project.

The repo already has most of the key primitives needed for that path:

- Secure Enclave-backed vault secret protection
- a separate Secure Enclave biometric gate primitive for privileged operations
- config-level per-operation gate toggles

What is still missing is the runtime wiring for the owner-approval flow, not
the underlying hardware primitive.

## What already exists

### Separate vault-unlock and privileged-operation primitives

`docs/secure-enclave-integration.md` is explicit that the current design uses
two independent Secure Enclave keys:

- vault key
  - protects the persisted vault secret
  - policy can be `open`, `passcode`, or `biometric`
- gate key
  - signs privileged operation challenges
  - always biometric

This is an important distinction. The first shipped owner-approval path does
not need to solve "passkey unlock everything." It can keep unattended daemon
start via the vault key while still requiring Touch ID for elevated actions.

### Existing gate abstraction

`packages/keys/src/biometric-gate.ts` already defines a generic per-operation
gate abstraction driven by config and a `BiometricPrompter`.

Before this note, the declared operations were:

- `rootKeyCreation`
- `operationalKeyRotation`
- `scopeExpansion`
- `egressExpansion`
- `agentCreation`

This tranche adds an explicit `adminReadElevation` gate target so the future
owner-approval flow does not need to piggyback on `scopeExpansion`.

### Existing SE-backed prompter

`packages/keys/src/se-gate-prompter.ts` already implements the Secure
Enclave-backed biometric prompt:

- creates a dedicated biometric SE key on first use
- signs an operation-specific challenge
- returns cancelled or internal errors cleanly
- fails closed on platforms without Secure Enclave support

That means the hardware-backed approval mechanism for the Apple-first path is
already real.

## What the first shipped path should be

For the v1 completion stack, the clean target is:

- owner-approved admin read elevation
- Apple-first
- backed by the existing Secure Enclave biometric gate
- explicitly separate from vault unlock

In practice:

- keep `vaultKeyPolicy = "open"` as a viable local default so the daemon can
  start unattended
- gate elevated message access with the dedicated biometric operation
- defer generic WebAuthn or cross-platform passkey UX until after the local
  owner-approval path is real

## What this is not

The first shipped slice should not promise:

- cross-platform passkey support
- WebAuthn-backed owner auth
- Convos iOS identity derivation parity
- hosted or split host/remote owner-approval semantics

Those are legitimate future directions, but they are not required to ship a
credible signet-native approval path.

## Recommended next implementation shape

1. `#296`
   define the explicit read-elevation object and lifecycle

2. `#297`
   consume the new `adminReadElevation` gate target during owner approval

3. only after that
   decide whether "passkey" should mean anything more than the existing
   Apple-first biometric-backed flow in v1

## Why this matters

If we keep saying "passkey flow" without narrowing it, we risk mixing together:

- vault unlock
- owner approval
- XMTP identity derivation
- cross-platform auth portability

The current codebase already supports a simpler and stronger statement:

> v1 will ship a signet-native, Secure-Enclave-backed biometric approval flow
> for sensitive owner actions. Broader passkey work remains deferred.

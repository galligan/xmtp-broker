# Key Hierarchy

The broker uses a three-tier key hierarchy inspired by keypo-cli's Secure
Enclave patterns. Each tier has a different lifetime and security posture.

## Tiers

```
Root Key (platform-bound, long-lived)
  └─ Operational Key (daily signing, rotatable)
       └─ Session Key (per-connection, ephemeral)
```

### Root keys

Bound to platform security hardware when available:

| Platform | Mechanism | Curve |
|----------|-----------|-------|
| macOS | Secure Enclave | P-256 |
| Linux | TPM 2.0 | P-256 |
| Fallback | Software-derived | P-256 |

Root keys never leave the secure boundary. The `initializeRootKey` function
detects platform capabilities and creates the appropriate key handle.

### Operational keys

Derived from the root key. Handle day-to-day signing:
- Attestation signing
- Message provenance metadata
- Key agreement for session establishment

Operational keys can be rotated without changing the root. The
`createOperationalKeyManager` handles rotation, storage, and signing.

### Session keys

Generated per harness connection. Scoped to a single session:
- Encrypt/decrypt session-specific data
- Sign session tokens
- Automatically discarded when the session ends

The `createSessionKeyManager` handles creation and cleanup.

## Encrypted vault

All key material at rest is stored in an encrypted vault managed by
`createVault`. The vault uses the root key to encrypt operational and session
key material before persisting to disk.

## Platform detection

`detectPlatform()` probes the runtime environment and returns a
`PlatformCapability` describing available security features. This feeds into:
- `platformToTrustTier()` — maps capabilities to a `TrustTier` for attestations
- Key generation — chooses hardware-backed or software keys
- Vault encryption — selects appropriate cipher based on platform

## Key manager

`createKeyManager` is the central orchestrator. It initializes the root key,
manages operational and session key lifecycles, and provides the
`SignerProvider` and `AttestationSigner` interfaces that other packages consume.

Packages never interact with raw key material directly — they receive
signing/verification capabilities through the provider interfaces defined in
`@xmtp-broker/contracts`.

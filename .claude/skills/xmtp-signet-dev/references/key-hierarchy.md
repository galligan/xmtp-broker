# Key Hierarchy

The signet uses a multi-tier key hierarchy with OWS-inspired encrypted vault
storage. Each tier has a different lifetime and security posture.

## Tiers

```
Root Key (P-256, platform-bound, long-lived)
  └─ protects vault containing:
       Operational Key (Ed25519, BIP-39/44 derived, per-identity)
       Admin Key (Ed25519, standalone — NOT derived from root)

Credential Token (per-credential, ephemeral)
```

### Root keys

Bound to platform security hardware when available:

| Platform | Mechanism | Curve |
|----------|-----------|-------|
| macOS | Secure Enclave | P-256 |
| Linux | TPM 2.0 | P-256 |
| Fallback | Software-derived | P-256 |

Root keys never leave the secure boundary. The `initializeRootKey` function
detects platform capabilities and creates the appropriate key handle. The root
key protects the encrypted vault but does not sign XMTP messages directly.

### Operational keys

Derived via BIP-39/44 from operator wallet mnemonics (passes Trezor test
vectors). Stored in the vault protected by the root key. Handle day-to-day
signing:
- XMTP message signing
- Seal signing and message-seal binding
- Credential token issuance

Operational keys can be rotated without changing the root.

### Credential keys

Generated for issued credentials. Scoped to a single credential:
- Bind harness auth to a credential token
- Sign credential-scoped operations when needed by the runtime adapter
- Expire or revoke with the credential lifecycle

The current key-manager adapter handles creation and cleanup.

## Encrypted vault

All key material at rest is stored in an encrypted vault managed by
`createVault`. The vault is used for persisted key and wallet state; ephemeral
credential keys remain runtime-scoped.

## Platform detection

`detectPlatform()` probes the runtime environment and returns a
`PlatformCapability` describing available security features. This feeds into:
- `platformToTrustTier()` — maps capabilities to a `TrustTier` for seals
- Key generation — chooses hardware-backed or software keys
- Vault encryption — selects appropriate cipher based on platform

## Key manager

`createKeyManager` is the central orchestrator. It initializes the root key,
manages operational and credential key lifecycles, and provides the
`SignerProvider` and `SealStamper` interfaces that other packages consume.

Packages never interact with raw key material directly — they receive
signing/verification capabilities through the provider interfaces defined in
`@xmtp/signet-contracts`.

## Admin keys

Admin keys are a separate key type for authenticating CLI and admin socket
operations. They are **peers** to the root key, not derived from it.

### Purpose

- Authenticate CLI commands against the signet daemon
- Sign JWTs for admin socket JSON-RPC requests
- Separate management auth from message signing and harness credential auth

### JWT flow

1. `createAdminKeyManager` generates or loads an admin key pair
2. CLI signs a JWT with the admin private key (`AdminJwtPayloadSchema`)
3. Admin socket validates the JWT signature before dispatching requests
4. `AdminAuthContext` on `HandlerContext` carries the verified admin identity

### Key types

- `AdminKeyRecord` — stored admin key with metadata
- `AdminJwtPayloadSchema` — JWT payload structure (issuer, expiry, etc.)
- `AdminJwtConfigSchema` — JWT signing config (algorithm, TTL)

### Utilities

`base64urlEncode` / `base64urlDecode` — JWT-safe encoding without padding.

The `KeyManager` exposes admin key management via its `.admin` property
(`AdminKeyManager`).

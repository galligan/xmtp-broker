import Foundation

/// Access control policy for Secure Enclave key operations.
public enum KeyPolicy: String, Codable, CaseIterable, Sendable {
    case open = "open"
    case passcode = "passcode"
    case biometric = "biometric"
}

// MARK: - Error Types

/// Domain-specific failures returned by the Secure Enclave helper layer.
public enum SignetError: Error, CustomStringConvertible {
    case seUnavailable
    case creationFailed(String)
    case keyMissing(String)
    case signingFailed(String)
    case invalidHex(String)
    case decryptionFailed(String)
    case authCancelled

    /// Human-readable description surfaced by the CLI.
    public var description: String {
        switch self {
        case .seUnavailable:
            return "Secure Enclave is not available on this device"
        case .creationFailed(let msg):
            return "key creation failed: \(msg)"
        case .keyMissing(let msg):
            return "key not found: \(msg)"
        case .signingFailed(let msg):
            return "signing failed: \(msg)"
        case .invalidHex(let msg):
            return "invalid hex: \(msg)"
        case .decryptionFailed(let msg):
            return "decryption failed: \(msg)"
        case .authCancelled:
            return "authentication cancelled by user"
        }
    }

    /// Process exit code used by the CLI wrapper.
    public var exitCode: Int32 {
        switch self {
        case .seUnavailable: return 1
        case .creationFailed: return 1
        case .keyMissing: return 1
        case .signingFailed: return 1
        case .invalidHex: return 1
        case .decryptionFailed: return 1
        case .authCancelled: return 2
        }
    }
}

// MARK: - JSON Response Types

/// Response payload for the `create` command.
public struct CreateResponse: Codable {
    public let keyRef: String
    public let publicKey: String
    public let policy: String
    public let label: String

    /// Create a JSON-encodable response for a newly created SE key.
    public init(keyRef: String, publicKey: String, policy: String, label: String) {
        self.keyRef = keyRef
        self.publicKey = publicKey
        self.policy = policy
        self.label = label
    }
}

/// Response payload for the `sign` command.
public struct SignResponse: Codable {
    public let signature: String

    /// Create a JSON-encodable signature response.
    public init(signature: String) {
        self.signature = signature
    }
}

/// Response payload for system and availability inspection.
public struct SystemInfoResponse: Codable {
    public let available: Bool
    public let chip: String?
    public let macOS: String?

    /// Create a JSON-encodable system information response.
    public init(available: Bool, chip: String?, macOS: String?) {
        self.available = available
        self.chip = chip
        self.macOS = macOS
    }
}

/// Response payload for the ECIES decrypt path.
public struct DecryptResponse: Codable {
    public let plaintext: String

    /// Create a JSON-encodable decrypt response.
    public init(plaintext: String) {
        self.plaintext = plaintext
    }
}

/// Response payload for existence checks against persisted key references.
public struct KeyInfoResponse: Codable {
    public let exists: Bool

    /// Create a JSON-encodable key lookup response.
    public init(exists: Bool) {
        self.exists = exists
    }
}

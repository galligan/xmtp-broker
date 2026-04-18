import ArgumentParser
import Foundation
import SignetCore

/// Decrypt an ECIES payload using a Secure Enclave key-agreement key.
struct DecryptCommand: ParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "decrypt",
        abstract: "Decrypt data using SE ECDH + HKDF + AES-GCM (ECIES)"
    )

    @OptionGroup var globals: GlobalOptions

    @Option(name: .long, help: "Base64-encoded SE key-agreement key reference")
    var keyRef: String

    @Option(name: .long, help: "Hex-encoded ephemeral P-256 public key (uncompressed)")
    var ephemeralPub: String

    @Option(name: .long, help: "Hex-encoded AES-GCM nonce (12 bytes)")
    var nonce: String

    @Option(name: .long, help: "Hex-encoded ciphertext")
    var ciphertext: String

    @Option(name: .long, help: "Hex-encoded AES-GCM authentication tag (16 bytes)")
    var tag: String

    /// Parse the CLI arguments, perform ECIES decryption, and emit the plaintext.
    mutating func run() throws {
        // Parse key reference
        guard let dataRep = Data(base64Encoded: keyRef) else {
            writeStderr("invalid key reference: not valid base64")
            throw ExitCode(1)
        }

        // Parse hex inputs
        let ephemeralPubData: Data
        let nonceData: Data
        let ciphertextData: Data
        let tagData: Data
        do {
            ephemeralPubData = try SignatureFormatter.parseHex(ephemeralPub)
            nonceData = try SignatureFormatter.parseHex(nonce)
            ciphertextData = try SignatureFormatter.parseHex(ciphertext)
            tagData = try SignatureFormatter.parseHex(tag)
        } catch {
            writeStderr("invalid hex input: \(error)")
            throw ExitCode(1)
        }

        // Validate sizes
        guard nonceData.count == 12 else {
            writeStderr("nonce must be 12 bytes, got \(nonceData.count)")
            throw ExitCode(1)
        }
        guard tagData.count == 16 else {
            writeStderr("tag must be 16 bytes, got \(tagData.count)")
            throw ExitCode(1)
        }

        // Decrypt via SE
        let manager = SecureEnclaveManager()
        let plaintext: Data
        do {
            plaintext = try manager.decrypt(
                dataRepresentation: dataRep,
                ephemeralPublicKeyData: ephemeralPubData,
                nonce: nonceData,
                ciphertext: ciphertextData,
                tag: tagData
            )
        } catch let error as SignetError {
            if case .authCancelled = error {
                writeStderr(error.description)
                throw ExitCode(2)
            }
            writeStderr(error.description)
            throw ExitCode(1)
        }

        let output = DecryptResponse(
            plaintext: SignatureFormatter.formatHex(plaintext)
        )

        try outputJSON(output)
    }
}

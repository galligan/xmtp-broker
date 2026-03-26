import ArgumentParser
import Foundation
import SignetCore

extension SecureEnclaveManager.KeyPurpose: ExpressibleByArgument {}

struct CreateCommand: ParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "create",
        abstract: "Generate a new P-256 key in the Secure Enclave"
    )

    @OptionGroup var globals: GlobalOptions

    @Option(name: .long, help: "Advisory label (echoed in output, not stored in SE)")
    var label: String

    @Option(name: .long, help: "Access control policy: open, passcode, or biometric")
    var policy: KeyPolicy

    @Option(name: .long, help: "Key purpose: signing or key-agreement")
    var purpose: SecureEnclaveManager.KeyPurpose = .signing

    mutating func run() throws {
        let manager = SecureEnclaveManager()

        guard manager.isAvailable() else {
            writeStderr("Secure Enclave is not available on this device")
            throw ExitCode(1)
        }

        let result: (dataRepresentation: Data, publicKey: Data)
        do {
            result = try manager.createKey(policy: policy, purpose: purpose)
        } catch let error as SignetError {
            if case .authCancelled = error {
                writeStderr(error.description)
                throw ExitCode(2)
            }
            writeStderr(error.description)
            throw ExitCode(1)
        }

        let output = CreateResponse(
            keyRef: result.dataRepresentation.base64EncodedString(),
            publicKey: SignatureFormatter.formatHex(result.publicKey),
            policy: policy.rawValue,
            label: label
        )

        try outputJSON(output)
    }
}

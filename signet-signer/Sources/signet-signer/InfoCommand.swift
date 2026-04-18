import ArgumentParser
import Foundation
import SignetCore

/// Inspect host Secure Enclave availability or resolve whether a key reference still exists.
struct InfoCommand: ParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "info",
        abstract: "Query system Secure Enclave availability or check if a key exists"
    )

    @OptionGroup var globals: GlobalOptions

    @Flag(name: .long, help: "Show system SE information")
    var system: Bool = false

    @Option(name: .long, help: "Base64-encoded SE key reference to check")
    var keyRef: String?

    /// Validate the requested mode and emit either system info or key lookup results.
    mutating func run() throws {
        if system && keyRef != nil {
            writeStderr("cannot specify both --system and --key-ref")
            throw ExitCode(1)
        }

        if !system && keyRef == nil {
            writeStderr("specify --system or --key-ref")
            throw ExitCode(1)
        }

        let manager = SecureEnclaveManager()

        if system {
            let output = SystemInfoResponse(
                available: manager.isAvailable(),
                chip: manager.getChipName(),
                macOS: manager.getMacOSVersion()
            )
            try outputJSON(output)
        } else if let ref = keyRef {
            let output = KeyInfoResponse(
                exists: manager.lookupKey(ref)
            )
            try outputJSON(output)
        }
    }
}

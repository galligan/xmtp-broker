import ArgumentParser
import Foundation
import SignetCore

extension KeyPolicy: ExpressibleByArgument {}

/// Root CLI entrypoint for Secure Enclave-backed P-256 helper operations.
struct SignetSigner: ParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "signet-signer",
        abstract: "P-256 key operations via Apple Secure Enclave",
        version: "0.1.0",
        subcommands: [
            CreateCommand.self,
            SignCommand.self,
            DecryptCommand.self,
            InfoCommand.self,
            DeleteCommand.self,
        ]
    )
}

// MARK: - Global Options

/// Shared command-line options supported by every subcommand.
struct GlobalOptions: ParsableArguments {
    @Option(name: .long, help: "Output format: json")
    var format: String = "json"
}

// MARK: - Output Helpers

/// Build the canonical JSON encoder used by command output helpers.
func makeEncoder() -> JSONEncoder {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    return encoder
}

/// Write a UTF-8 string directly to stdout without additional formatting.
func writeStdout(_ string: String) {
    if let data = string.data(using: .utf8) {
        FileHandle.standardOutput.write(data)
    }
}

/// Emit a standardized error line to stderr.
func writeStderr(_ string: String) {
    if let data = "error: \(string)\n".data(using: .utf8) {
        FileHandle.standardError.write(data)
    }
}

/// Encode any `Encodable` value as canonical JSON and terminate with a newline.
func outputJSON<T: Encodable>(_ value: T) throws {
    let encoder = makeEncoder()
    let data = try encoder.encode(value)
    FileHandle.standardOutput.write(data)
    writeStdout("\n")
}

SignetSigner.main()

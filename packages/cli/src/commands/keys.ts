import { Command } from "commander";
import { Result } from "better-result";
import { withDaemonClient } from "./admin-rpc.js";

/** Build the `signet keys` command group. */
export function buildKeysCommand(): Command {
  const keys = new Command("keys").description("Key management operations");

  keys
    .command("rotate")
    .description("Rotate all operational keys immediately")
    .option("--config <path>", "Path to signet config file")
    .option("--json", "Output JSON instead of human-readable text")
    .action(async (options: { config?: string; json?: boolean }) => {
      const result = await withDaemonClient(options, {}, async (client) => {
        return client.request("keys.rotate", {});
      });

      if (Result.isError(result)) {
        if (options.json) {
          // eslint-disable-next-line no-console
          console.log(
            JSON.stringify({ ok: false, error: result.error.message }),
          );
        } else {
          // eslint-disable-next-line no-console
          console.error("Key rotation failed:", result.error.message);
        }
        process.exit(1);
      }

      const data = result.value as { rotated: number };
      if (options.json) {
        // eslint-disable-next-line no-console
        console.log(JSON.stringify({ ok: true, ...data }));
      } else {
        // eslint-disable-next-line no-console
        console.log(`Rotated ${data.rotated} operational key(s).`);
      }
    });

  return keys;
}

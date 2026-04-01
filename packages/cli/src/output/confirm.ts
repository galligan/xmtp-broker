/**
 * Interactive confirmation for destructive operations.
 *
 * When `--force` is not set, shows what would happen and exits cleanly.
 * When `--force` is set, the caller proceeds with the action.
 *
 * @module
 */

/**
 * Gate a destructive CLI action behind the `--force` flag.
 *
 * Returns `true` when execution should proceed (force is set).
 * When force is not set, writes a dry-run message to stderr and
 * exits with code 0.
 */
export function requireForce(
  opts: { force?: boolean },
  description: string,
  writeStderr: (msg: string) => void,
  exit: (code: number) => void,
): boolean {
  if (opts.force) return true;
  writeStderr(`This will ${description}.\n`);
  writeStderr(`Run with --force to execute.\n`);
  exit(0);
  return false;
}

import { describe, expect, test } from "bun:test";
import { requireForce } from "../output/confirm.js";

describe("requireForce", () => {
  test("returns true when force is set", () => {
    const stderr: string[] = [];
    let exitCode: number | undefined;
    const result = requireForce(
      { force: true },
      "delete everything",
      (msg) => stderr.push(msg),
      (code) => {
        exitCode = code;
      },
    );
    expect(result).toBe(true);
    expect(stderr).toEqual([]);
    expect(exitCode).toBeUndefined();
  });

  test("returns false and prints dry-run message when force is not set", () => {
    const stderr: string[] = [];
    let exitCode: number | undefined;
    const result = requireForce(
      {},
      "delete everything",
      (msg) => stderr.push(msg),
      (code) => {
        exitCode = code;
      },
    );
    expect(result).toBe(false);
    expect(stderr.join("")).toContain("This will delete everything.");
    expect(stderr.join("")).toContain("Run with --force to execute.");
    expect(exitCode).toBe(0);
  });

  test("returns false when force is explicitly false", () => {
    const stderr: string[] = [];
    let exitCode: number | undefined;
    const result = requireForce(
      { force: false },
      "remove the widget",
      (msg) => stderr.push(msg),
      (code) => {
        exitCode = code;
      },
    );
    expect(result).toBe(false);
    expect(stderr.join("")).toContain("This will remove the widget.");
    expect(exitCode).toBe(0);
  });

  test("outputs structured JSON to stderr when json flag is set", () => {
    const stderr: string[] = [];
    let exitCode: number | undefined;
    const result = requireForce(
      { json: true },
      "delete everything",
      (msg) => stderr.push(msg),
      (code) => {
        exitCode = code;
      },
    );
    expect(result).toBe(false);
    const parsed = JSON.parse(stderr.join(""));
    expect(parsed.error).toBe("dry_run");
    expect(parsed.message).toContain("delete everything");
    expect(parsed.message).toContain("--force");
    expect(exitCode).toBe(0);
  });

  test("returns true when force is set regardless of json flag", () => {
    const stderr: string[] = [];
    let exitCode: number | undefined;
    const result = requireForce(
      { force: true, json: true },
      "delete everything",
      (msg) => stderr.push(msg),
      (code) => {
        exitCode = code;
      },
    );
    expect(result).toBe(true);
    expect(stderr).toEqual([]);
    expect(exitCode).toBeUndefined();
  });
});

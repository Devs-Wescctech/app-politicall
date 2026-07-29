import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scanner = path.resolve(process.cwd(), "scripts/check-release-secrets.mjs");
const temporaryDirectories: string[] = [];

async function createCandidate(files: Record<string, string | Buffer>) {
  const directory = await mkdtemp(path.join(tmpdir(), "politicall-release-scan-"));
  temporaryDirectories.push(directory);
  await execFileAsync("git", ["init", "--quiet"], { cwd: directory });
  await Promise.all(Object.entries(files).map(async ([name, contents]) => {
    await writeFile(path.join(directory, name), contents);
  }));
  return directory;
}

async function scan(directory: string) {
  return execFileAsync(process.execPath, [scanner], { cwd: directory });
}

async function scanWithoutReading(directory: string, protectedFile: string) {
  const readLog = path.join(directory, "read-log.txt");
  const preload = path.join(directory, "read-guard.cjs");
  await writeFile(readLog, "");
  await writeFile(preload, [
    'const fs = require("node:fs");',
    'const path = require("node:path");',
    'const { syncBuiltinESMExports } = require("node:module");',
    "const originalReadFileSync = fs.readFileSync;",
    "fs.readFileSync = (target, ...args) => {",
    "  if (typeof target === \"string\" && path.resolve(target) === process.env.PROTECTED_FILE) fs.writeFileSync(process.env.READ_LOG, \"read\");",
    "  return originalReadFileSync(target, ...args);",
    "};",
    "syncBuiltinESMExports();",
  ].join("\n"));

  await execFileAsync(process.execPath, ["--require", preload, scanner], {
    cwd: directory,
    env: {
      ...process.env,
      PROTECTED_FILE: path.join(directory, protectedFile),
      READ_LOG: readLog,
    },
  });

  return readFile(readLog, "utf8");
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("release secret scanner", () => {
  it.each([
    ["private-key.txt", ["-----BEGIN", "PRIVATE", "KEY-----"].join(" ") + "\nfixture\n-----END PRIVATE KEY-----\n", "private-key-marker", ["-----BEGIN", "PRIVATE", "KEY-----"].join(" ")],
    ["database.env", "DATABASE_URL=" + ["postgresql:", "//release_user:fixture-password@db.example.test:5432/politicall"].join("") + "\n", "database-url-credentials", "fixture-password"],
    ["application.env", "SESSION_SECRET=" + ["sk_live_", "1234567890abcdefghijklmnop"].join("") + "\n", "secret-assignment", ["sk_live_", "1234567890abcdefghijklmnop"].join("")],
  ])("rejects %s using the %s rule", async (name, contents, rule, secretValue) => {
    const directory = await createCandidate({ [name]: contents });
    const error = await scan(directory).then(
      () => new Error("expected the scanner to reject the candidate"),
      (reason) => reason,
    );

    expect(error).toMatchObject({
      stderr: expect.stringContaining(`${name}:${rule}:1`),
    });
    expect(error.stderr).not.toContain(secretValue);
  });

  it("skips binary candidates", async () => {
    const directory = await createCandidate({ "binary.dat": Buffer.from([0, 0x70, 0x6b]) });

    await expect(scan(directory)).resolves.toMatchObject({ stderr: "" });
  });

  it("does not read candidates larger than 5 MB", async () => {
    const directory = await createCandidate({
      "large.txt": Buffer.alloc((5 * 1024 * 1024) + 1, 0x61),
    });

    await expect(scanWithoutReading(directory, "large.txt")).resolves.toBe("");
  });

  it("allows documented placeholders without echoing their values", async () => {
    const placeholder = "replace-with-a-32-character-random-string";
    const directory = await createCandidate({
      ".env.example": [
        "DATABASE_URL=postgresql://username:password@localhost:5432/database_name",
        `SESSION_SECRET=${placeholder}`,
        "OPENAI_API_KEY=your_api_key_here",
      ].join("\n"),
    });

    const result = await scan(directory);

    expect(result.stdout).not.toContain(placeholder);
    expect(result.stderr).toBe("");
  });
});

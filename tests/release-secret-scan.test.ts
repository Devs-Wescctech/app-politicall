import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
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

async function scanWithIoFailure(directory: string, protectedFile: string, operation: "statSync" | "readFileSync") {
  const preload = path.join(directory, "io-failure.cjs");
  await writeFile(preload, [
    'const fs = require("node:fs");',
    'const path = require("node:path");',
    'const { syncBuiltinESMExports } = require("node:module");',
    "const original = fs[process.env.IO_OPERATION];",
    "fs[process.env.IO_OPERATION] = (target, ...args) => {",
    "  if (typeof target === \"string\" && path.resolve(target) === process.env.PROTECTED_FILE) throw new Error(\"simulated io failure\");",
    "  return original(target, ...args);",
    "};",
    "syncBuiltinESMExports();",
  ].join("\n"));

  return execFileAsync(process.execPath, ["--require", preload, scanner], {
    cwd: directory,
    env: {
      ...process.env,
      IO_OPERATION: operation,
      PROTECTED_FILE: path.join(directory, protectedFile),
    },
  });
}

async function scanWithPrefixIoFailure(directory: string, protectedFile: string, operation: "openSync" | "readSync") {
  const closeLog = path.join(directory, "close-log.txt");
  const preload = path.join(directory, "prefix-io-failure.cjs");
  await writeFile(closeLog, "");
  await writeFile(preload, [
    'const fs = require("node:fs");',
    'const path = require("node:path");',
    'const { syncBuiltinESMExports } = require("node:module");',
    "const protectedDescriptors = new Set();",
    "const originalOpenSync = fs.openSync;",
    "const originalReadSync = fs.readSync;",
    "const originalCloseSync = fs.closeSync;",
    "const isProtected = (target) => typeof target === \"string\" && path.resolve(target) === process.env.PROTECTED_FILE;",
    "fs.openSync = (target, ...args) => {",
    "  if (!isProtected(target)) return originalOpenSync(target, ...args);",
    "  if (process.env.IO_OPERATION === \"openSync\") throw new Error(\"simulated prefix io failure\");",
    "  const descriptor = originalOpenSync(target, ...args);",
    "  protectedDescriptors.add(descriptor);",
    "  return descriptor;",
    "};",
    "fs.readSync = (descriptor, ...args) => {",
    "  if (process.env.IO_OPERATION === \"readSync\" && protectedDescriptors.has(descriptor)) throw new Error(\"simulated prefix io failure\");",
    "  return originalReadSync(descriptor, ...args);",
    "};",
    "fs.closeSync = (descriptor, ...args) => {",
    "  if (protectedDescriptors.has(descriptor)) fs.writeFileSync(process.env.CLOSE_LOG, \"closed\");",
    "  return originalCloseSync(descriptor, ...args);",
    "};",
    "syncBuiltinESMExports();",
  ].join("\n"));

  const error = await execFileAsync(process.execPath, ["--require", preload, scanner], {
    cwd: directory,
    env: {
      ...process.env,
      IO_OPERATION: operation,
      PROTECTED_FILE: path.join(directory, protectedFile),
      CLOSE_LOG: closeLog,
    },
  }).then(
    () => new Error("expected the scanner to fail closed"),
    (reason) => reason,
  );

  return { closeLog: await readFile(closeLog, "utf8"), error };
}

async function scanWithoutAnyRead(directory: string, protectedFile: string) {
  const readLog = path.join(directory, "all-read-log.txt");
  const preload = path.join(directory, "all-read-guard.cjs");
  await writeFile(readLog, "");
  await writeFile(preload, [
    'const fs = require("node:fs");',
    'const path = require("node:path");',
    'const { syncBuiltinESMExports } = require("node:module");',
    "const protectedDescriptors = new Set();",
    "const originalOpenSync = fs.openSync;",
    "const originalReadSync = fs.readSync;",
    "const originalReadFileSync = fs.readFileSync;",
    "const isProtected = (target) => typeof target === \"string\" && path.resolve(target) === process.env.PROTECTED_FILE;",
    "fs.openSync = (target, ...args) => {",
    "  if (!isProtected(target)) return originalOpenSync(target, ...args);",
    "  fs.appendFileSync(process.env.READ_LOG, \"open\\n\");",
    "  const descriptor = originalOpenSync(target, ...args);",
    "  protectedDescriptors.add(descriptor);",
    "  return descriptor;",
    "};",
    "fs.readSync = (descriptor, ...args) => {",
    "  if (protectedDescriptors.has(descriptor)) fs.appendFileSync(process.env.READ_LOG, \"read\\n\");",
    "  return originalReadSync(descriptor, ...args);",
    "};",
    "fs.readFileSync = (target, ...args) => {",
    "  if (isProtected(target)) fs.appendFileSync(process.env.READ_LOG, \"full\\n\");",
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

    await expect(scanWithoutReading(directory, "binary.dat")).resolves.toBe("");
  });

  it("skips unknown binary candidates without NUL bytes or a full read", async () => {
    const directory = await createCandidate({ "binary-control.dat": Buffer.alloc(8 * 1024, 0x01) });

    await expect(scanWithoutReading(directory, "binary-control.dat")).resolves.toBe("");
  });

  it("skips known binary extensions without a full read", async () => {
    const directory = await createCandidate({ "binary-image.png": Buffer.from("not-an-image") });

    await expect(scanWithoutReading(directory, "binary-image.png")).resolves.toBe("");
  });

  it("does not read candidates larger than 5 MB", async () => {
    const directory = await createCandidate({
      "large.txt": Buffer.alloc((5 * 1024 * 1024) + 1, 0x61),
    });

    await expect(scanWithoutAnyRead(directory, "large.txt")).resolves.toBe("");
  });

  it.each([
    ["stat-failure.txt", "statSync", "io-stat"],
    ["read-failure.txt", "readFileSync", "io-read"],
  ] as const)("fails closed when %s fails", async (name, operation, rule) => {
    const directory = await createCandidate({ [name]: "safe text candidate\n" });
    const error = await scanWithIoFailure(directory, name, operation).then(
      () => new Error("expected the scanner to fail closed"),
      (reason) => reason,
    );

    expect(error).toMatchObject({
      stderr: expect.stringContaining(`${name}:${rule}:0`),
    });
    expect(error.stderr).not.toContain("simulated io failure");
  });

  it("fails closed when opening the binary prefix fails", async () => {
    const directory = await createCandidate({ "open-failure.txt": "safe text candidate\n" });
    const { error, closeLog } = await scanWithPrefixIoFailure(directory, "open-failure.txt", "openSync");

    expect(error).toMatchObject({
      code: 1,
      stderr: expect.stringContaining("open-failure.txt:io-prefix:0"),
    });
    expect(error.stderr).not.toContain("simulated prefix io failure");
    expect(closeLog).toBe("");
  });

  it("fails closed and closes the descriptor when reading the binary prefix fails", async () => {
    const directory = await createCandidate({ "prefix-read-failure.txt": "safe text candidate\n" });
    const { error, closeLog } = await scanWithPrefixIoFailure(directory, "prefix-read-failure.txt", "readSync");

    expect(error).toMatchObject({
      code: 1,
      stderr: expect.stringContaining("prefix-read-failure.txt:io-prefix:0"),
    });
    expect(error.stderr).not.toContain("simulated prefix io failure");
    expect(closeLog).toBe("closed");
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

  it("ignores tracked files intentionally deleted from the working tree", async () => {
    const directory = await createCandidate({ "removed.txt": "safe text\n" });
    await execFileAsync("git", ["add", "removed.txt"], { cwd: directory });
    await unlink(path.join(directory, "removed.txt"));

    await expect(scan(directory)).resolves.toMatchObject({ stderr: "" });
  });
});

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scanner = path.resolve(process.cwd(), "scripts/check-release-secrets.mjs");
const temporaryDirectories: string[] = [];

async function createCandidate(files: Record<string, string>) {
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

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("release secret scanner", () => {
  it.each([
    ["private-key.txt", ["-----BEGIN", "PRIVATE", "KEY-----"].join(" ") + "\nfixture\n-----END PRIVATE KEY-----\n", "private-key-marker"],
    ["database.env", "DATABASE_URL=" + ["postgresql:", "//release_user:fixture-password@db.example.test:5432/politicall"].join("") + "\n", "database-url-credentials"],
    ["application.env", "SESSION_SECRET=" + ["sk_live_", "1234567890abcdefghijklmnop"].join("") + "\n", "secret-assignment"],
  ])("rejects %s using the %s rule", async (name, contents, rule) => {
    const directory = await createCandidate({ [name]: contents });

    await expect(scan(directory)).rejects.toMatchObject({
      stderr: expect.stringContaining(`${name}:${rule}:1`),
    });
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

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const clientRoot = path.resolve(process.cwd(), "client/src");
const taskSixBoundary = new Set(["pages/contracts.tsx"]);

async function sourceFiles(directory: string, relative = ""): Promise<Array<{ relative: string; source: string }>> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryRelative = path.join(relative, entry.name);
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath, entryRelative);
    if (!/\.(?:ts|tsx)$/.test(entry.name) || entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) return [];
    return [{ relative: entryRelative.replaceAll("\\", "/"), source: await readFile(entryPath, "utf8") }];
  }));
  return nested.flat();
}

describe("tenant browser auth source gate", () => {
  it("does not persist tenant credentials or construct tenant Bearer headers", async () => {
    const files = (await sourceFiles(clientRoot)).filter((file) => !taskSixBoundary.has(file.relative));
    const source = files.map((file) => `// ${file.relative}\n${file.source}`).join("\n");
    const tenantConsumers = files
      .filter((file) => file.relative !== "lib/auth.ts")
      .map((file) => `// ${file.relative}\n${file.source}`).join("\n");

    expect(source).not.toMatch(/localStorage\.(?:getItem|setItem|removeItem)\(\s*["']auth_token["']/);
    expect(source).not.toMatch(/Authorization\s*:\s*`Bearer \$\{(?:getAuthToken|token)\(/);
    expect(source).not.toMatch(/headers\[["']Authorization["']\]\s*=\s*`Bearer/);
    expect(tenantConsumers).not.toMatch(/setAuthToken\(/);
  });
});

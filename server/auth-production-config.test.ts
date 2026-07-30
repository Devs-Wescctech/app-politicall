import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("production authentication configuration", () => {
  it("requires an explicit public application origin in deployment configuration", async () => {
    const [example, compose] = await Promise.all([
      readFile(path.join(root, ".env.example"), "utf8"),
      readFile(path.join(root, "docker-compose.yml"), "utf8"),
    ]);

    expect(example).toContain("PUBLIC_APP_URL=https://politicall.example");
    expect(example).toContain("ENABLE_BEARER_EXCHANGE=false");
    expect(compose).toContain('PUBLIC_APP_URL: "${PUBLIC_APP_URL:?required}"');
    expect(compose).toContain('ENABLE_BEARER_EXCHANGE: "${ENABLE_BEARER_EXCHANGE:-false}"');
  });
});

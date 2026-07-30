import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const clientRoot = path.resolve(process.cwd(), "client/src");
const publicSessionPages = [
  "pages/petition-public.tsx",
  "pages/survey-landing.tsx",
  "pages/public-support.tsx",
  "pages/alliance-invite.tsx",
] as const;

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

function isTaskSixAdminBoundary(relative: string): boolean {
  return relative === "pages/contracts.tsx"
    || relative === "pages/admin.tsx"
    || relative === "pages/admin-login.tsx"
    || relative === "pages/admin-sales.tsx"
    || relative === "components/admin-bottom-nav.tsx"
    || relative.startsWith("components/admin/");
}

function withoutAllowedApiKeyExamples(source: string): string {
  return source
    .replaceAll(/Bearer\s+YOUR_API_KEY/g, "ALLOWED_API_KEY")
    .replaceAll(/Bearer\s+pk_[A-Za-z0-9_.*-]+/g, "ALLOWED_API_KEY");
}

function tenantCredentialViolations(source: string): string[] {
  const candidate = withoutAllowedApiKeyExamples(source);
  const patterns = [
    /(?:window\.)?(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\(\s*["']auth_token["']/,
    /(?:\[\s*["']authorization["']\s*\]|["']?authorization["']?)\s*:\s*(?:`|["'])Bearer\s+/i,
    /\.set\(\s*["']authorization["']\s*,\s*(?:`|["'])Bearer\s+/i,
    /\[\s*["']authorization["']\s*\]\s*=\s*(?:`|["'])Bearer\s+/i,
    /\.authorization\s*=\s*(?:`|["'])Bearer\s+/i,
  ];
  return patterns.filter((pattern) => pattern.test(candidate)).map((pattern) => pattern.source);
}

describe("tenant browser auth source gate", () => {
  it("recognizes tenant storage and direct Bearer construction variants", () => {
    const prohibited = [
      'window.localStorage.getItem("auth_token")',
      'localStorage.setItem("auth_token", token)',
      'const TOKEN_KEY = "auth_token"; localStorage.setItem(TOKEN_KEY, token)',
      'const headers = { Authorization: `Bearer ${token}` }',
      'const headers = new Headers({ authorization: `Bearer ${token}` })',
      'headers.set("Authorization", `Bearer ${token}`)',
      'const AUTH_HEADER = "Authorization"; headers.set(AUTH_HEADER, `Bearer ${token}`)',
      'headers["Authorization"] = `Bearer ${token}`',
      'headers.authorization = `Bearer ${token}`',
    ];
    for (const fixture of prohibited) expect(tenantCredentialViolations(fixture), fixture).not.toEqual([]);
    expect(tenantCredentialViolations('const TOKEN_KEY = "theme"; localStorage.setItem(TOKEN_KEY, value)')).toEqual([]);
    expect(tenantCredentialViolations('const docs = "Bearer YOUR_API_KEY"')).toEqual([]);
    expect(tenantCredentialViolations('const docs = "Bearer pk_example"')).toEqual([]);
    expect(tenantCredentialViolations('const AUTH_HEADER = "Authorization"; headers.set(AUTH_HEADER, "Bearer pk_example")')).toEqual([]);
  });

  it("does not persist tenant credentials or construct tenant Bearer headers outside Task 6 admin code", async () => {
    const files = (await sourceFiles(clientRoot)).filter((file) => !isTaskSixAdminBoundary(file.relative));
    const violations = files.flatMap((file) =>
      tenantCredentialViolations(file.source).map((pattern) => `${file.relative}:${pattern}`),
    );
    const tenantConsumers = files.filter((file) => file.relative !== "lib/auth.ts");

    expect(violations).toEqual([]);
    expect(tenantConsumers.map((file) => file.source).join("\n")).not.toMatch(/\bsetAuthToken\(/);
  });

  it("keeps public session pages on the explicit public helper", async () => {
    const files = await sourceFiles(clientRoot);
    for (const relative of publicSessionPages) {
      const source = files.find((file) => file.relative === relative)?.source ?? "";
      expect(source, relative).toContain("publicApiRequest");
      expect(source, relative).not.toMatch(/\bapiRequest\b/);
      expect(source, relative).not.toMatch(/\bfetch\(/);
    }
  });

  it("requires cookie credentials in both first-party request abstractions", async () => {
    const sessionSource = await readFile(path.join(clientRoot, "lib/session.ts"), "utf8");
    const rawRequestSource = sessionSource.slice(
      sessionSource.indexOf("const rawRequest"),
      sessionSource.indexOf("const performRefresh"),
    );
    const publicRequestSource = sessionSource.slice(
      sessionSource.indexOf("const publicApiRequest"),
      sessionSource.indexOf("const bootstrap"),
    );

    expect(rawRequestSource).toMatch(/dependencies\.fetch\(url,\s*\{[^}]*credentials:\s*["']include["'][^}]*\}\)/);
    expect(publicRequestSource).toContain("rawRequest(method, url, data)");
    expect(publicRequestSource).not.toMatch(/ensureCsrfToken|refreshSession/);
  });

  it("keeps the landing page neutral until session bootstrap resolves", async () => {
    const landing = await readFile(path.join(clientRoot, "pages/landing.tsx"), "utf8");

    expect(landing).toContain('session.status !== "unauthenticated"');
    expect(landing.indexOf('session.status !== "unauthenticated"')).toBeLessThan(landing.indexOf('data-testid="img-header-logo"'));
  });
});

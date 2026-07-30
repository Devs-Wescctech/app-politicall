import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const readProjectFile = (relative: string) => readFile(path.join(root, relative), "utf8");

describe("authentication documentation contract", () => {
  it("documents cookie-session endpoints, CSRF, and staged Bearer shutdown", async () => {
    const [api, portainer, evidence] = await Promise.all([
      readProjectFile("docs/api/authentication.md"),
      readProjectFile("docs/deployment/portainer-production.md"),
      readProjectFile("docs/testing/auth-security-hardening.tdd.md"),
    ]);

    for (const source of [api, portainer, evidence]) {
      expect(source).toContain("ENABLE_BEARER_AUTH=false");
      expect(source).toContain("ENABLE_BEARER_EXCHANGE=false");
      expect(source).not.toMatch(/postgres(?:ql)?:\/\/[^<\s/:@]+:[^<\s/@]+@/i);
      expect(source).not.toMatch(/SESSION_SECRET=[A-Za-z0-9+/]{24,}={0,2}/);
    }

    for (const required of [
      "POST `/api/auth/register`",
      "POST `/api/auth/login`",
      "GET `/api/auth/me`",
      "GET `/api/auth/csrf`",
      "POST `/api/auth/refresh`",
      "DELETE `/api/auth/refresh`",
      "POST `/api/auth/logout`",
      "POST `/api/auth/exchange`",
      "POST `/api/admin/login`",
      "GET `/api/admin/verify`",
      "`/api/admin/auth/refresh`",
      "`/api/admin/auth/exchange`",
      "POST `/api/admin/users/:id/impersonate`",
      "`politicall_access`",
      "`politicall_refresh`",
      "`politicall_csrf`",
      "`politicall_admin_access`",
      "`politicall_admin_refresh`",
      "`politicall_admin_csrf`",
      "`x-csrf-token`",
      "`HttpOnly`",
      "`SameSite=Lax`",
      "`Secure`",
      "Account, first user, and first session are committed in one database transaction",
    ]) {
      expect(api).toContain(required);
    }

    expect(portainer).toContain("## Authentication Rollout");
    expect(portainer).toContain("Deploy cookie-only first");
    expect(portainer).toContain("enable only `ENABLE_BEARER_EXCHANGE=true`");
    expect(portainer).toContain("disable `ENABLE_BEARER_EXCHANGE` again");
    expect(portainer).toContain("Rotate `SESSION_SECRET`, `DATA_ENCRYPTION_KEY`, and `ADMIN_MASTER_PASSWORD_HASH`");
    expect(evidence).toContain("Browser QA Matrix");
  });

  it("keeps registration atomicity wired as one transactional operation", async () => {
    const [routes, publicAuthRoutes] = await Promise.all([
      readProjectFile("server/routes.ts"),
      readProjectFile("server/routes/public-auth-routes.ts"),
    ]);

    expect(publicAuthRoutes).toContain("registerUserSession(input: RegistrationSessionInput)");
    expect(publicAuthRoutes).not.toContain("createAccount(");
    expect(publicAuthRoutes).not.toContain("createUser(");
    expect(routes).toContain("registerUserSession: (input) => db.transaction");
    expect(routes).toContain("tx.insert(accounts)");
    expect(routes).toContain("tx.insert(users)");
    expect(routes).toContain("createDrizzleAuthSessionRepository(tx)");
    expect(routes).toContain("issueUserSession(toAuthSessionUser(user), input.session)");
  });
});

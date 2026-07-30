import { describe, expect, it, vi } from "vitest";
import { createAdminSessionClient } from "./admin-session";

function response(body: unknown, status = 200): Response {
  return new Response(body === undefined ? undefined : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function dependencies(overrides: Partial<Parameters<typeof createAdminSessionClient>[0]> = {}) {
  const cookies = new Map<string, string>();
  const cleanup = {
    clearQueryCache: vi.fn(),
    clearAdminCache: vi.fn(),
    clearImpersonationMarker: vi.fn(),
  };
  return {
    fetch: vi.fn<typeof fetch>(),
    readCookie: vi.fn((name: string) => cookies.get(name) ?? null),
    cleanup,
    cookies,
    dependencies: { fetch: vi.fn<typeof fetch>(), readCookie: vi.fn(), cleanup, ...overrides },
  };
}

describe("admin cookie session", () => {
  it("logs in with credentials included, ignores a legacy token payload, and probes before protected UI resolves", async () => {
    const fetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ admin: true, token: "must-not-be-stored" }))
      .mockResolvedValueOnce(response({ valid: true }));
    const client = createAdminSessionClient({
      fetch,
      readCookie: () => null,
      cleanup: { clearQueryCache: vi.fn(), clearAdminCache: vi.fn(), clearImpersonationMarker: vi.fn() },
    });

    await client.login({ password: "correct-password" });
    expect(client.getSnapshot()).toEqual({ status: "authenticated" });
    expect(fetch.mock.calls[0]).toEqual(["/api/admin/login", expect.objectContaining({ method: "POST", credentials: "include" })]);

    await client.bootstrap();
    expect(fetch.mock.calls[1]).toEqual(["/api/admin/verify", { credentials: "include" }]);
  });

  it("sends only the admin CSRF cookie for mutations and retries an unauthorized request once after one refresh", async () => {
    const cookies = new Map([["politicall_admin_csrf", "admin-csrf"]]);
    const fetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ error: "Authentication failed" }, 401))
      .mockResolvedValueOnce(response({ admin: true }))
      .mockResolvedValueOnce(response({ ok: true }));
    const client = createAdminSessionClient({
      fetch,
      readCookie: (name) => cookies.get(name) ?? null,
      cleanup: { clearQueryCache: vi.fn(), clearAdminCache: vi.fn(), clearImpersonationMarker: vi.fn() },
    });

    await expect(client.adminRequest("POST", "/api/admin/settings/example", { enabled: true })).resolves.toMatchObject({ ok: true });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "/api/admin/settings/example",
      "/api/admin/auth/refresh",
      "/api/admin/settings/example",
    ]);
    expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: "include" });
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get("x-csrf-token")).toBe("admin-csrf");
  });

  it("deduplicates concurrent refreshes through its distinct admin coordinator", async () => {
    const coordinateRefresh = vi.fn(async (refresh: () => Promise<boolean>) => refresh());
    const fetch = vi.fn<typeof fetch>().mockResolvedValue(response({ admin: true }));
    const client = createAdminSessionClient({
      fetch,
      readCookie: () => "admin-csrf",
      coordinateRefresh,
      cleanup: { clearQueryCache: vi.fn(), clearAdminCache: vi.fn(), clearImpersonationMarker: vi.fn() },
    });

    await expect(Promise.all([client.refresh(), client.refresh()])).resolves.toEqual([true, true]);
    expect(coordinateRefresh).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([401, 403])("falls back to tenant-safe refresh revocation after expired admin logout %s and clears caches", async (status) => {
    const cleanup = { clearQueryCache: vi.fn(), clearAdminCache: vi.fn(), clearImpersonationMarker: vi.fn() };
    const fetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ error: "Authentication failed" }, status))
      .mockResolvedValueOnce(response(undefined, 204));
    const client = createAdminSessionClient({ fetch, readCookie: () => "admin-csrf", cleanup });

    await expect(client.logout()).resolves.toEqual({ error: null });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/admin/auth/logout", "/api/admin/auth/refresh"]);
    expect(cleanup.clearQueryCache).toHaveBeenCalledOnce();
    expect(cleanup.clearAdminCache).toHaveBeenCalledOnce();
    expect(cleanup.clearImpersonationMarker).toHaveBeenCalledOnce();
    expect(client.getSnapshot()).toEqual({ status: "unauthenticated" });
  });
});

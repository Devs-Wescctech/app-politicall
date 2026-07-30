import { describe, expect, it, vi } from "vitest";
import { createAdminSessionClient } from "./admin-session";
import { createRefreshCoordinator, type RefreshCoordinationChannel, type RefreshCoordinationMessage } from "./session-coordinator";

class SharedChannelBus {
  private readonly listeners = new Map<string, Set<(message: RefreshCoordinationMessage) => void>>();

  channel(id: string): RefreshCoordinationChannel {
    const ownListeners = new Set<(message: RefreshCoordinationMessage) => void>();
    this.listeners.set(id, ownListeners);
    return {
      postMessage: (message) => {
        for (const [listenerId, listeners] of this.listeners) {
          if (listenerId !== id) for (const listener of listeners) listener(message);
        }
      },
      subscribe: (listener) => {
        ownListeners.add(listener);
        return () => ownListeners.delete(listener);
      },
    };
  }
}

function response(body: unknown, status = 200): Response {
  return new Response(body === undefined ? undefined : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
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
  it("logs in with credentials included, ignores a legacy token payload, and exposes an independent probe", async () => {
    const fetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ admin: true, token: "must-not-be-stored" }));
    const client = createAdminSessionClient({
      fetch,
      readCookie: () => null,
      cleanup: { clearQueryCache: vi.fn(), clearAdminCache: vi.fn(), clearImpersonationMarker: vi.fn() },
    });

    await client.login({ password: "correct-password" });
    expect(client.getSnapshot()).toEqual({ status: "authenticated" });
    expect(fetch.mock.calls[0]).toEqual(["/api/admin/login", expect.objectContaining({ method: "POST", credentials: "include" })]);

    const probeFetch = vi.fn<typeof fetch>().mockResolvedValue(response({ valid: true }));
    const probeClient = createAdminSessionClient({
      fetch: probeFetch,
      readCookie: () => null,
      cleanup: { clearQueryCache: vi.fn(), clearAdminCache: vi.fn(), clearImpersonationMarker: vi.fn() },
    });
    await probeClient.bootstrap();
    expect(probeFetch.mock.calls[0]).toEqual(["/api/admin/verify", { credentials: "include" }]);
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

  it("cleans privileged caches exactly once before publishing unauthenticated after a request and refresh rejection", async () => {
    const cleanup = { clearQueryCache: vi.fn(), clearAdminCache: vi.fn(), clearImpersonationMarker: vi.fn() };
    const fetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ error: "Authentication failed" }, 401))
      .mockResolvedValueOnce(response({ error: "Authentication failed" }, 401));
    const client = createAdminSessionClient({ fetch, readCookie: () => "admin-csrf", cleanup });

    await expect(client.adminRequest("GET", "/api/admin/users")).rejects.toThrow("Admin request failed");
    expect(cleanup.clearQueryCache).toHaveBeenCalledOnce();
    expect(cleanup.clearAdminCache).toHaveBeenCalledOnce();
    expect(cleanup.clearImpersonationMarker).toHaveBeenCalledOnce();
    expect(client.getSnapshot()).toEqual({ status: "unauthenticated" });
  });

  it.each([401, 403])("invalidates after a successful refresh when the retried request is an auth rejection %s", async (status) => {
    const cleanup = { clearQueryCache: vi.fn(), clearAdminCache: vi.fn(), clearImpersonationMarker: vi.fn() };
    const fetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ error: "Authentication failed" }, 401))
      .mockResolvedValueOnce(response({ admin: true }))
      .mockResolvedValueOnce(response({ error: "Authentication failed" }, status));
    const client = createAdminSessionClient({ fetch, readCookie: () => "admin-csrf", cleanup });

    await expect(client.adminRequest("GET", "/api/admin/users")).rejects.toThrow("Admin request failed");
    expect(client.getSnapshot()).toEqual({ status: "unauthenticated" });
    expect(cleanup.clearQueryCache).toHaveBeenCalledOnce();
    expect(cleanup.clearAdminCache).toHaveBeenCalledOnce();
    expect(cleanup.clearImpersonationMarker).toHaveBeenCalledOnce();
  });

  it("invalidates when the coordinator reports a remote refresh failure, but keeps a functional 403 authenticated", async () => {
    const cleanup = { clearQueryCache: vi.fn(), clearAdminCache: vi.fn(), clearImpersonationMarker: vi.fn() };
    const coordinateRefresh = vi.fn(async () => false);
    const fetch = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ error: "Authentication failed" }, 401));
    const client = createAdminSessionClient({ fetch, readCookie: () => "admin-csrf", cleanup, coordinateRefresh });

    await expect(client.adminRequest("GET", "/api/admin/users")).rejects.toThrow("Admin request failed");
    expect(client.getSnapshot()).toEqual({ status: "unauthenticated" });
    expect(cleanup.clearQueryCache).toHaveBeenCalledOnce();

    const functionalCleanup = { clearQueryCache: vi.fn(), clearAdminCache: vi.fn(), clearImpersonationMarker: vi.fn() };
    const functionalFetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ admin: true }))
      .mockResolvedValueOnce(response({ error: "Permission denied" }, 403));
    const functionalClient = createAdminSessionClient({ fetch: functionalFetch, readCookie: () => "admin-csrf", cleanup: functionalCleanup });
    await functionalClient.login({ password: "correct-password" });
    await expect(functionalClient.adminRequest("GET", "/api/admin/users")).rejects.toThrow("Admin request failed");
    expect(functionalClient.getSnapshot()).toEqual({ status: "authenticated" });
    expect(functionalCleanup.clearQueryCache).not.toHaveBeenCalled();
  });

  it("shares a failed real cross-tab refresh before either client resets coordination", async () => {
    const bus = new SharedChannelBus();
    const firstCoordinator = createRefreshCoordinator({ channel: bus.channel("first"), participantId: "first", claimWindowMs: 1, leaseMs: 5_000 });
    const secondCoordinator = createRefreshCoordinator({ channel: bus.channel("second"), participantId: "second", claimWindowMs: 1, leaseMs: 5_000 });
    const firstCleanup = { clearQueryCache: vi.fn(), clearAdminCache: vi.fn(), clearImpersonationMarker: vi.fn() };
    const secondCleanup = { clearQueryCache: vi.fn(), clearAdminCache: vi.fn(), clearImpersonationMarker: vi.fn() };
    const firstFetch = vi.fn<typeof fetch>().mockResolvedValue(response({ error: "Authentication failed" }, 401));
    const secondFetch = vi.fn<typeof fetch>().mockResolvedValue(response({ error: "Authentication failed" }, 401));
    const first = createAdminSessionClient({ fetch: firstFetch, readCookie: () => "admin-csrf", cleanup: firstCleanup, coordinateRefresh: firstCoordinator.run, resetRefreshCoordination: firstCoordinator.reset });
    const second = createAdminSessionClient({ fetch: secondFetch, readCookie: () => "admin-csrf", cleanup: secondCleanup, coordinateRefresh: secondCoordinator.run, resetRefreshCoordination: secondCoordinator.reset });

    await expect(Promise.race([
      Promise.all([first.refresh(), second.refresh()]),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("waited for refresh lease")), 100)),
    ])).resolves.toEqual([false, false]);
    expect(firstFetch.mock.calls.length + secondFetch.mock.calls.length).toBe(1);
    expect(first.getSnapshot()).toEqual({ status: "unauthenticated" });
    expect(second.getSnapshot()).toEqual({ status: "unauthenticated" });
    expect(firstCleanup.clearQueryCache).toHaveBeenCalledOnce();
    expect(secondCleanup.clearQueryCache).toHaveBeenCalledOnce();
    firstCoordinator.dispose();
    secondCoordinator.dispose();
  });

  it("does not let old refresh, probe, or logout responses overwrite a newer login", async () => {
    const refresh = deferred<Response>();
    const probe = deferred<Response>();
    const logout = deferred<Response>();
    const fetch = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (url === "/api/admin/auth/refresh") return refresh.promise;
      if (url === "/api/admin/verify") return probe.promise;
      if (url === "/api/admin/auth/logout") return logout.promise;
      if (url === "/api/admin/login") return response({ admin: true });
      throw new Error(`Unexpected request: ${url}`);
    });
    const client = createAdminSessionClient({
      fetch,
      readCookie: () => "admin-csrf",
      cleanup: { clearQueryCache: vi.fn(), clearAdminCache: vi.fn(), clearImpersonationMarker: vi.fn() },
    });

    const staleProbe = client.bootstrap();
    const staleRefresh = client.refresh();
    const staleLogout = client.logout();
    await client.login({ password: "new-password" });
    probe.resolve(response({ valid: false }, 401));
    refresh.resolve(response({ error: "Authentication failed" }, 401));
    logout.resolve(response(undefined, 204));
    await Promise.all([staleProbe, staleRefresh, staleLogout]);

    expect(client.getSnapshot()).toEqual({ status: "authenticated" });
  });

  it("keeps bootstrap and refresh flights scoped to their generation", async () => {
    const oldProbe = deferred<Response>();
    const oldRefresh = deferred<Response>();
    const newRefresh = deferred<Response>();
    let refreshCount = 0;
    const fetch = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (url === "/api/admin/verify") return oldProbe.promise;
      if (url === "/api/admin/auth/refresh") return ++refreshCount === 1 ? oldRefresh.promise : newRefresh.promise;
      if (url === "/api/admin/login") return response({ admin: true });
      throw new Error(`Unexpected request: ${url}`);
    });
    const client = createAdminSessionClient({
      fetch,
      readCookie: () => "admin-csrf",
      cleanup: { clearQueryCache: vi.fn(), clearAdminCache: vi.fn(), clearImpersonationMarker: vi.fn() },
    });

    const staleBootstrap = client.bootstrap();
    const staleRefresh = client.refresh();
    await client.login({ password: "new-password" });
    const currentBootstrap = client.bootstrap();
    const currentRefresh = client.refresh();
    expect(client.bootstrap()).not.toBe(staleBootstrap);
    expect(currentRefresh).toBe(client.refresh());
    await expect(currentBootstrap).resolves.toEqual({ status: "authenticated" });

    oldProbe.resolve(response({ valid: false }, 401));
    oldRefresh.resolve(response({ admin: true }));
    await expect(staleRefresh).resolves.toBe(false);
    expect(currentRefresh).toBe(client.refresh());
    newRefresh.resolve(response({ admin: true }));
    await expect(currentRefresh).resolves.toBe(true);
  });

  it("preserves FormData and exposes an explicit response mode while keeping default errors bounded", async () => {
    const form = new FormData();
    form.append("file", new Blob(["content"]), "file.txt");
    const fetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ ok: true }))
      .mockResolvedValueOnce(response({ detail: "secret server body" }, 418));
    const client = createAdminSessionClient({
      fetch,
      readCookie: () => "admin-csrf",
      cleanup: { clearQueryCache: vi.fn(), clearAdminCache: vi.fn(), clearImpersonationMarker: vi.fn() },
    });

    await client.adminRequest("POST", "/api/admin/import", form);
    const raw = await client.adminRequest("GET", "/api/admin/errors", undefined, { returnErrorResponse: true });
    expect(fetch.mock.calls[0][1]).toMatchObject({ body: form, credentials: "include" });
    expect((fetch.mock.calls[0][1]?.headers as Headers).get("Content-Type")).toBeNull();
    expect(raw.status).toBe(418);
  });

  it("keeps localized 400 details out of the default error", async () => {
    const client = createAdminSessionClient({
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response({ error: "internal localized detail" }, 400)),
      readCookie: () => "admin-csrf",
      cleanup: { clearQueryCache: vi.fn(), clearAdminCache: vi.fn(), clearImpersonationMarker: vi.fn() },
    });
    await expect(client.adminRequest("POST", "/api/admin/settings/example", { enabled: true }))
      .rejects.toThrow("Admin request failed");
  });
});

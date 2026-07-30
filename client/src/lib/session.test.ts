import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionClient, type SessionDependencies } from "./session";

type FetchCall = [input: RequestInfo | URL, init?: RequestInit];

const DISPLAY_USER = {
  id: "user-1",
  name: "Ana Silva",
  email: "ana@example.test",
  role: "admin",
  permissions: { dashboard: true },
  avatar: "/avatar.png",
};

function response(body: unknown, status = 200): Response {
  return new Response(body === undefined ? undefined : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createDependencies(overrides: Partial<SessionDependencies> = {}) {
  const values = new Map<string, string>();
  const fetch = vi.fn<(...args: FetchCall) => Promise<Response>>();
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
  };
  const cookies = new Map<string, string>();
  const cleanup = {
    clearQueryCache: vi.fn(),
    clearAttendanceCache: vi.fn(),
    clearImpersonationMarker: vi.fn(),
  };

  return {
    fetch,
    storage,
    cookies,
    cleanup,
    dependencies: {
      fetch,
      storage,
      readCookie: (name: string) => cookies.get(name) ?? null,
      cleanup,
      ...overrides,
    } satisfies SessionDependencies,
  };
}

describe("cookie session client", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("keeps only a validated sanitized display user in storage", () => {
    const { dependencies, storage } = createDependencies();
    const session = createSessionClient(dependencies);

    session.cacheUser({ ...DISPLAY_USER, password: "must-not-persist", accountId: "account-1" });

    expect(storage.setItem).toHaveBeenCalledWith("auth_user", JSON.stringify(DISPLAY_USER));
    storage.getItem.mockReturnValueOnce(JSON.stringify({ id: "x", password: "bad" }));
    expect(session.getCachedUser()).toBeNull();
  });

  it("bootstraps as loading and retries /me once after a successful refresh", async () => {
    const { dependencies, fetch, cookies } = createDependencies();
    cookies.set("politicall_csrf", "csrf-before-refresh");
    let resolveFirstMe!: (result: Response) => void;
    fetch
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveFirstMe = resolve; }))
      .mockResolvedValueOnce(response({ user: DISPLAY_USER }))
      .mockResolvedValueOnce(response(DISPLAY_USER));
    const session = createSessionClient(dependencies);

    const bootstrap = session.bootstrap();
    expect(session.getSnapshot().status).toBe("loading");
    resolveFirstMe(response({ error: "Authentication failed" }, 401));
    await bootstrap;

    expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/auth/me", "/api/auth/refresh", "/api/auth/me"]);
    expect(session.getSnapshot()).toMatchObject({ status: "authenticated", user: DISPLAY_USER });
  });

  it("includes credentials and CSRF on JSON mutations without an Authorization header", async () => {
    const { dependencies, fetch, cookies } = createDependencies();
    cookies.set("politicall_csrf", "csrf-token");
    fetch.mockResolvedValue(response({ ok: true }));
    const session = createSessionClient(dependencies);

    await session.apiRequest("PATCH", "/api/contacts/1", { name: "Ana" });

    expect(fetch).toHaveBeenCalledWith("/api/contacts/1", expect.objectContaining({
      method: "PATCH",
      credentials: "include",
      body: JSON.stringify({ name: "Ana" }),
    }));
    const headers = fetch.mock.calls[0][1]?.headers as Headers;
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("x-csrf-token")).toBe("csrf-token");
    expect(headers.get("Authorization")).toBeNull();
  });

  it("obtains a CSRF cookie before a mutation when it is absent", async () => {
    const { dependencies, fetch, cookies } = createDependencies();
    fetch.mockImplementation(async (url) => {
      if (url === "/api/auth/csrf") {
        cookies.set("politicall_csrf", "new-csrf-token");
        return response({ csrf: true });
      }
      return response({ ok: true });
    });
    const session = createSessionClient(dependencies);

    await session.apiRequest("POST", "/api/contacts", { name: "Ana" });

    expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/auth/csrf", "/api/contacts"]);
    expect((fetch.mock.calls[1][1]?.headers as Headers).get("x-csrf-token")).toBe("new-csrf-token");
  });

  it("preserves FormData and download responses while using cookie credentials", async () => {
    const { dependencies, fetch, cookies } = createDependencies();
    cookies.set("politicall_csrf", "csrf-token");
    fetch.mockResolvedValue(response(undefined));
    const session = createSessionClient(dependencies);
    const form = new FormData();
    form.append("file", new Blob(["content"]), "contacts.csv");

    await session.apiRequest("POST", "/api/contacts/import", form);
    const download = await session.apiRequest("GET", "/api/contacts/export");

    expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: "include", body: form });
    expect((fetch.mock.calls[0][1]?.headers as Headers).get("Content-Type")).toBeNull();
    expect(download).toBeInstanceOf(Response);
    expect(fetch.mock.calls[1][1]).toMatchObject({ credentials: "include", method: "GET" });
  });

  it("refreshes once after a 401, re-reads rotated CSRF, and retries the original request once", async () => {
    const { dependencies, fetch, cookies } = createDependencies();
    cookies.set("politicall_csrf", "csrf-before-refresh");
    fetch.mockImplementation(async (url) => {
      if (url === "/api/contacts/1" && fetch.mock.calls.filter(([callUrl]) => callUrl === url).length === 1) {
        return response({ error: "Authentication failed" }, 401);
      }
      if (url === "/api/auth/refresh") {
        cookies.set("politicall_csrf", "csrf-after-refresh");
        return response({ user: DISPLAY_USER });
      }
      return response({ ok: true });
    });
    const session = createSessionClient(dependencies);

    await session.apiRequest("DELETE", "/api/contacts/1", { reason: "duplicate" });

    expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/contacts/1", "/api/auth/refresh", "/api/contacts/1"]);
    expect((fetch.mock.calls[2][1]?.headers as Headers).get("x-csrf-token")).toBe("csrf-after-refresh");
  });

  it("deduplicates same-tab refreshes and does not retry after refresh failure", async () => {
    const { dependencies, fetch, cookies } = createDependencies();
    cookies.set("politicall_csrf", "csrf-token");
    fetch.mockResolvedValue(response({ error: "Authentication failed" }, 401));
    const session = createSessionClient(dependencies);

    const [first, second] = await Promise.all([session.refreshSession(), session.refreshSession()]);
    expect([first, second]).toEqual([false, false]);
    expect(fetch).toHaveBeenCalledTimes(1);

    fetch.mockClear();
    fetch.mockResolvedValue(response({ error: "Authentication failed" }, 401));
    await expect(session.apiRequest("GET", "/api/contacts")).rejects.toThrow("Authentication failed");
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/contacts", "/api/auth/refresh"]);
  });

  it("waits for the cross-tab refresh owner instead of issuing another rotation", async () => {
    const coordinateRefresh = vi.fn(async () => true);
    const { dependencies, fetch } = createDependencies({ coordinateRefresh });
    const session = createSessionClient(dependencies);

    await expect(session.refreshSession()).resolves.toBe(true);
    expect(coordinateRefresh).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses access logout, falls back to refresh revocation, then clears every cache after the request settles", async () => {
    const { dependencies, fetch, cookies, cleanup, storage } = createDependencies();
    cookies.set("politicall_csrf", "csrf-token");
    fetch.mockResolvedValueOnce(response({ error: "Authentication failed" }, 401)).mockResolvedValueOnce(response(undefined, 204));
    const session = createSessionClient(dependencies);
    session.cacheUser(DISPLAY_USER);

    const result = await session.logoutSession();

    expect(result).toEqual({ error: null });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/auth/logout", "/api/auth/refresh"]);
    expect(fetch.mock.calls[1][1]).toMatchObject({ method: "DELETE", credentials: "include" });
    expect(storage.removeItem).toHaveBeenCalledWith("auth_user");
    expect(cleanup.clearQueryCache).toHaveBeenCalledOnce();
    expect(cleanup.clearAttendanceCache).toHaveBeenCalledOnce();
    expect(cleanup.clearImpersonationMarker).toHaveBeenCalledOnce();
  });
});

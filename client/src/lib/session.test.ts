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

const SECOND_DISPLAY_USER = {
  ...DISPLAY_USER,
  id: "user-2",
  name: "Bruno Souza",
  email: "bruno@example.test",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

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

  it("bootstraps only once after the session state resolves", async () => {
    const { dependencies, fetch } = createDependencies();
    fetch.mockImplementation(async () => response(DISPLAY_USER));
    const session = createSessionClient(dependencies);
    const listener = vi.fn();
    session.subscribe(listener);

    await session.bootstrap();
    listener.mockClear();
    await session.bootstrap();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(listener).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toMatchObject({ status: "authenticated", user: DISPLAY_USER });
  });

  it.each([
    ["network failure", () => Promise.reject(new Error("offline"))],
    ["invalid JSON", () => Promise.resolve(new Response("not-json", { status: 200 }))],
  ])("leaves loading deterministically after %s during bootstrap", async (_case, result) => {
    const { dependencies, fetch, storage } = createDependencies();
    fetch.mockImplementation(result);
    const session = createSessionClient(dependencies);
    session.cacheUser(DISPLAY_USER);

    await expect(session.bootstrap()).resolves.toEqual({ status: "unauthenticated", user: null });

    expect(session.getSnapshot()).toEqual({ status: "unauthenticated", user: null });
    expect(storage.removeItem).toHaveBeenCalledWith("auth_user");
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

  it("does not issue a mutation when CSRF acquisition fails", async () => {
    const { dependencies, fetch } = createDependencies();
    fetch.mockResolvedValue(response({ error: "Authentication failed" }, 403));
    const session = createSessionClient(dependencies);

    await expect(session.apiRequest("POST", "/api/contacts", { name: "Ana" })).rejects.toThrow("Authentication failed");
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/auth/csrf"]);
  });

  it("uses cookie credentials for public login without treating the response as a token payload", async () => {
    const { dependencies, fetch } = createDependencies();
    fetch.mockResolvedValue(response({ user: DISPLAY_USER, token: "ignored" }));
    const session = createSessionClient(dependencies);

    await expect(session.loginSession({ email: DISPLAY_USER.email, password: "secret" })).resolves.toEqual(DISPLAY_USER);
    const request = fetch.mock.calls[0][1]!;
    expect(request.credentials).toBe("include");
    expect((request.headers as Headers).get("x-csrf-token")).toBeNull();
    expect((request.headers as Headers).get("Authorization")).toBeNull();
  });

  it("sends public JSON and FormData requests with cookies but without authenticated CSRF or refresh", async () => {
    const { dependencies, fetch } = createDependencies();
    fetch.mockResolvedValue(response({ ok: true }));
    const session = createSessionClient(dependencies);
    const form = new FormData();
    form.append("file", new Blob(["content"]), "attachment.txt");

    const jsonResponse = await session.publicApiRequest("POST", "/api/public/support/candidate", { name: "Ana" });
    const formResponse = await session.publicApiRequest("POST", "/api/public/petitions/upload", form);

    expect(jsonResponse).toBeInstanceOf(Response);
    expect(formResponse).toBeInstanceOf(Response);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "/api/public/support/candidate",
      "/api/public/petitions/upload",
    ]);
    const jsonRequest = fetch.mock.calls[0][1]!;
    const formRequest = fetch.mock.calls[1][1]!;
    expect(jsonRequest).toMatchObject({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ name: "Ana" }),
    });
    expect((jsonRequest.headers as Headers).get("Content-Type")).toBe("application/json");
    expect((jsonRequest.headers as Headers).get("x-csrf-token")).toBeNull();
    expect(formRequest).toMatchObject({ method: "POST", credentials: "include", body: form });
    expect((formRequest.headers as Headers).get("Content-Type")).toBeNull();
  });

  it("does not refresh or acquire authenticated CSRF after a public request rejection", async () => {
    const { dependencies, fetch } = createDependencies();
    fetch.mockResolvedValue(response({ error: "Authentication failed" }, 401));
    const session = createSessionClient(dependencies);

    await expect(session.publicApiRequest("POST", "/api/public/support/candidate", {}))
      .rejects.toThrow("Authentication failed");

    expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/public/support/candidate"]);
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

  it("retries an unauthorized request only once", async () => {
    const { dependencies, fetch, cookies } = createDependencies();
    cookies.set("politicall_csrf", "csrf-token");
    fetch
      .mockResolvedValueOnce(response({ error: "Authentication failed" }, 401))
      .mockResolvedValueOnce(response({ user: DISPLAY_USER }))
      .mockResolvedValueOnce(response({ error: "Authentication failed" }, 401));
    const session = createSessionClient(dependencies);

    await expect(session.apiRequest("GET", "/api/contacts")).rejects.toThrow("Authentication failed");
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/contacts", "/api/auth/refresh", "/api/contacts"]);
  });

  it("waits for the cross-tab refresh owner instead of issuing another rotation", async () => {
    const coordinateRefresh = vi.fn(async () => true);
    const { dependencies, fetch } = createDependencies({ coordinateRefresh });
    const session = createSessionClient(dependencies);

    await expect(session.refreshSession()).resolves.toBe(true);
    expect(coordinateRefresh).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("ignores a successful refresh response that arrives after logout", async () => {
    const pendingRefresh = deferred<Response>();
    const { dependencies, fetch, cookies, storage } = createDependencies();
    cookies.set("politicall_csrf", "csrf-token");
    fetch.mockImplementation(async (url) => {
      if (url === "/api/auth/refresh") return pendingRefresh.promise;
      if (url === "/api/auth/logout") return response(undefined, 204);
      throw new Error(`Unexpected request: ${url}`);
    });
    const session = createSessionClient(dependencies);

    const refreshResult = session.refreshSession();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/auth/refresh", expect.anything()));
    await session.logoutSession();
    pendingRefresh.resolve(response({ user: DISPLAY_USER }));

    await expect(refreshResult).resolves.toBe(false);
    expect(session.getSnapshot()).toEqual({ status: "unauthenticated", user: null });
    expect(session.getCachedUser()).toBeNull();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("does not let an old refresh overwrite a newer login", async () => {
    const pendingRefresh = deferred<Response>();
    const { dependencies, fetch, cookies } = createDependencies();
    cookies.set("politicall_csrf", "csrf-token");
    fetch.mockImplementation(async (url) => {
      if (url === "/api/auth/refresh") return pendingRefresh.promise;
      if (url === "/api/auth/login") return response({ user: SECOND_DISPLAY_USER });
      throw new Error(`Unexpected request: ${url}`);
    });
    const session = createSessionClient(dependencies);

    const refreshResult = session.refreshSession();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/auth/refresh", expect.anything()));
    await session.loginSession({ email: SECOND_DISPLAY_USER.email, password: "secret" });
    pendingRefresh.resolve(response({ user: DISPLAY_USER }));

    await expect(refreshResult).resolves.toBe(false);
    expect(session.getSnapshot()).toEqual({ status: "authenticated", user: SECOND_DISPLAY_USER });
    expect(session.getCachedUser()).toEqual(SECOND_DISPLAY_USER);
  });

  it("does not let an old bootstrap overwrite a newer login", async () => {
    const pendingBootstrap = deferred<Response>();
    const { dependencies, fetch } = createDependencies();
    fetch.mockImplementation(async (url) => {
      if (url === "/api/auth/me") return pendingBootstrap.promise;
      if (url === "/api/auth/login") return response({ user: SECOND_DISPLAY_USER });
      throw new Error(`Unexpected request: ${url}`);
    });
    const session = createSessionClient(dependencies);

    const bootstrapResult = session.bootstrap();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/auth/me", { credentials: "include" }));
    await session.loginSession({ email: SECOND_DISPLAY_USER.email, password: "secret" });
    pendingBootstrap.resolve(response(DISPLAY_USER));
    await bootstrapResult;

    expect(session.getSnapshot()).toEqual({ status: "authenticated", user: SECOND_DISPLAY_USER });
    expect(session.getCachedUser()).toEqual(SECOND_DISPLAY_USER);
  });

  it("does not let an old logout clear a newer login", async () => {
    const pendingLogout = deferred<Response>();
    const { dependencies, fetch, cookies, cleanup } = createDependencies();
    cookies.set("politicall_csrf", "csrf-token");
    fetch.mockResolvedValueOnce(response({ user: DISPLAY_USER }));
    const session = createSessionClient(dependencies);
    await session.loginSession({ email: DISPLAY_USER.email, password: "secret" });
    fetch.mockImplementation(async (url) => {
      if (url === "/api/auth/logout") return pendingLogout.promise;
      if (url === "/api/auth/login") return response({ user: SECOND_DISPLAY_USER });
      throw new Error(`Unexpected request: ${url}`);
    });

    const logoutResult = session.logoutSession();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/auth/logout", expect.anything()));
    await session.loginSession({ email: SECOND_DISPLAY_USER.email, password: "secret" });
    pendingLogout.resolve(response(undefined, 204));
    await logoutResult;

    expect(session.getSnapshot()).toEqual({ status: "authenticated", user: SECOND_DISPLAY_USER });
    expect(session.getCachedUser()).toEqual(SECOND_DISPLAY_USER);
    expect(cleanup.clearQueryCache).not.toHaveBeenCalled();
  });

  it.each([401, 403])("falls back to refresh revocation after logout status %s and clears every cache", async (status) => {
    const { dependencies, fetch, cookies, cleanup, storage } = createDependencies();
    cookies.set("politicall_csrf", "csrf-token");
    fetch.mockResolvedValueOnce(response({ error: "Authentication failed" }, status)).mockResolvedValueOnce(response(undefined, 204));
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

  it("does not mask a non-authentication logout error with refresh revocation", async () => {
    const { dependencies, fetch, cookies, cleanup } = createDependencies();
    cookies.set("politicall_csrf", "csrf-token");
    fetch.mockResolvedValue(response({ error: "Service unavailable" }, 503));
    const session = createSessionClient(dependencies);

    await expect(session.logoutSession()).resolves.toEqual({ error: "Unable to end session" });

    expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/auth/logout"]);
    expect(cleanup.clearQueryCache).toHaveBeenCalledOnce();
  });

  it("does not treat a functional 403 as an expired access session", async () => {
    const { dependencies, fetch, cookies } = createDependencies();
    cookies.set("politicall_csrf", "csrf-token");
    fetch.mockResolvedValue(response({ error: "Forbidden" }, 403));
    const session = createSessionClient(dependencies);

    await expect(session.logoutSession()).resolves.toEqual({ error: "Unable to end session" });

    expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/auth/logout"]);
  });
});

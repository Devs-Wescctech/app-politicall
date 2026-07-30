import { describe, expect, it, vi } from "vitest";
import {
  CookieJar,
  createSmokeHttpClient,
  openAttendanceRealtimeSocket,
  requireEnvironment,
} from "../scripts/attendance-smoke-helpers.mjs";

function jsonResponse(body: unknown, cookies: string[] = [], status = 200): Response {
  const headers = new Headers({ "content-type": "application/json" });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

function cookieHeaders(...cookies: string[]): Headers {
  const headers = new Headers();
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return headers;
}

describe("attendance smoke authentication helpers", () => {
  it("requires explicit smoke credentials without a fallback", () => {
    expect(() => requireEnvironment("TEST_EMAIL", {})).toThrow("TEST_EMAIL");
    expect(() => requireEnvironment("TEST_PASSWORD", {})).toThrow("TEST_PASSWORD");
    expect(requireEnvironment("TEST_EMAIL", { TEST_EMAIL: "operator@example.test" }))
      .toBe("operator@example.test");
  });

  it("filters login cookies for each exact HTTP destination", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/api/auth/login")) {
        return jsonResponse(
          { user: { id: "user-1", accountId: "account-1" } },
          [
            "politicall_access=access-cookie-1; Path=/; HttpOnly; SameSite=Lax",
            "politicall_refresh=refresh-cookie-1; Path=/api/auth/refresh; HttpOnly; SameSite=Lax",
            "politicall_csrf=csrf-cookie-1; Path=/; SameSite=Lax",
          ],
        );
      }
      return jsonResponse({ id: "connection-1" });
    });
    const client = createSmokeHttpClient({
      baseUrl: "https://api.example.test",
      origin: "https://app.example.test",
      fetchImpl,
    });

    await client.login("operator@example.test", "explicit-password");
    await client.request("/api/attendance/connections", {
      method: "POST",
      body: { name: "Smoke" },
    });
    await client.request("/api/auth/refresh", {
      method: "POST",
      body: {},
    });

    const loginHeaders = new Headers(calls[0].init.headers);
    const attendanceHeaders = new Headers(calls[1].init.headers);
    const refreshHeaders = new Headers(calls[2].init.headers);
    expect(loginHeaders.get("origin")).toBe("https://app.example.test");
    expect(loginHeaders.has("authorization")).toBe(false);
    expect(attendanceHeaders.get("origin")).toBe("https://app.example.test");
    expect(attendanceHeaders.get("cookie")).toContain("politicall_access=access-cookie-1");
    expect(attendanceHeaders.get("cookie")).toContain("politicall_csrf=csrf-cookie-1");
    expect(attendanceHeaders.get("cookie")).not.toContain("politicall_refresh");
    expect(attendanceHeaders.get("x-csrf-token")).toBe("csrf-cookie-1");
    expect(attendanceHeaders.has("authorization")).toBe(false);
    expect(refreshHeaders.get("cookie")).toContain("politicall_access=access-cookie-1");
    expect(refreshHeaders.get("cookie")).toContain("politicall_refresh=refresh-cookie-1");
    expect(refreshHeaders.get("cookie")).toContain("politicall_csrf=csrf-cookie-1");
  });

  it("keeps concurrent operator cookie jars isolated", async () => {
    const mutationCookies: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
      const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
      if (String(url).endsWith("/api/auth/login")) {
        const slot = body.email.startsWith("a-") ? "a" : "b";
        return jsonResponse(
          { user: { id: `user-${slot}`, accountId: "account-1" } },
          [
            `politicall_access=access-${slot}; Path=/; HttpOnly`,
            `politicall_csrf=csrf-${slot}; Path=/`,
          ],
        );
      }
      mutationCookies.push(new Headers(init.headers).get("cookie") ?? "");
      return jsonResponse({ ok: true });
    });
    const operatorA = createSmokeHttpClient({
      baseUrl: "https://api.example.test",
      origin: "https://app.example.test",
      fetchImpl,
    });
    const operatorB = createSmokeHttpClient({
      baseUrl: "https://api.example.test",
      origin: "https://app.example.test",
      fetchImpl,
    });

    await Promise.all([
      operatorA.login("a-operator@example.test", "password-a"),
      operatorB.login("b-operator@example.test", "password-b"),
    ]);
    await Promise.all([
      operatorA.request("/api/attendance/action-a", { method: "POST", body: {} }),
      operatorB.request("/api/attendance/action-b", { method: "POST", body: {} }),
    ]);

    expect(mutationCookies).toContain("politicall_access=access-a; politicall_csrf=csrf-a");
    expect(mutationCookies).toContain("politicall_access=access-b; politicall_csrf=csrf-b");
    expect(operatorA.jar).not.toBe(operatorB.jar);
  });

  it("opens the exact credential-free WebSocket target with cookie and Origin", () => {
    const jar = new CookieJar();
    jar.absorb(
      cookieHeaders(
        "politicall_access=access-cookie; Path=/; HttpOnly",
        "politicall_refresh=refresh-cookie; Path=/api/auth/refresh; HttpOnly",
        "politicall_csrf=csrf-cookie; Path=/",
      ),
      "https://api.example.test/api/auth/login",
    );
    const client = createSmokeHttpClient({
      baseUrl: "https://api.example.test",
      origin: "https://app.example.test",
      fetchImpl: vi.fn(),
      jar,
    });
    const constructed: Array<{ url: string; options: Record<string, unknown> }> = [];
    class FakeWebSocket {
      constructor(url: string, options: Record<string, unknown>) {
        constructed.push({ url, options });
      }
    }

    openAttendanceRealtimeSocket(FakeWebSocket, client);

    expect(constructed).toEqual([{
      url: "wss://api.example.test/api/attendance/realtime",
      options: {
        origin: "https://app.example.test",
        headers: {
          Cookie: "politicall_access=access-cookie; politicall_csrf=csrf-cookie",
        },
        perMessageDeflate: false,
      },
    }]);
    expect(new URL(constructed[0].url).search).toBe("");
    expect(JSON.stringify(constructed[0].options.headers)).not.toContain("politicall_refresh");
  });

  it("matches cookie paths on exact paths and slash boundaries", () => {
    const jar = new CookieJar();
    jar.absorb(
      cookieHeaders("politicall_refresh=encoded%2Erefresh; Path=/api/auth/refresh"),
      "https://api.example.test/api/auth/login",
    );

    expect(jar.header("https://api.example.test/api/auth/refresh"))
      .toBe("politicall_refresh=encoded%2Erefresh");
    expect(jar.header("https://api.example.test/api/auth/refresh/rotate"))
      .toBe("politicall_refresh=encoded%2Erefresh");
    expect(jar.header("https://api.example.test/api/auth/refreshing")).toBe("");
    expect(jar.header("https://api.example.test/api/attendance/realtime")).toBe("");
  });

  it("sends Secure cookies only over HTTPS and WSS", () => {
    const jar = new CookieJar();
    jar.absorb(
      cookieHeaders("secure_session=raw%2Evalue; Path=/; Secure; HttpOnly"),
      "https://api.example.test/api/auth/login",
    );

    expect(jar.header("https://api.example.test/api/attendance/realtime"))
      .toBe("secure_session=raw%2Evalue");
    expect(jar.header("wss://api.example.test/api/attendance/realtime"))
      .toBe("secure_session=raw%2Evalue");
    expect(jar.header("http://api.example.test/api/attendance/realtime")).toBe("");
    expect(jar.header("ws://api.example.test/api/attendance/realtime")).toBe("");
  });

  it("excludes expired and cleared cookies", () => {
    const jar = new CookieJar();
    jar.absorb(
      cookieHeaders(
        "active=active-value; Path=/; Max-Age=60",
        "expired=expired-value; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
        "cleared=initial-value; Path=/",
      ),
      "https://api.example.test/api/auth/login",
    );
    jar.absorb(
      cookieHeaders("cleared=deleted-value; Path=/; Max-Age=0"),
      "https://api.example.test/api/auth/login",
    );

    expect(jar.header("https://api.example.test/api/attendance/realtime"))
      .toBe("active=active-value");
  });

  it("keeps host-only cookies on their origin host and honors Domain scope", () => {
    const jar = new CookieJar();
    jar.absorb(
      cookieHeaders(
        "host_only=host-value; Path=/",
        "domain_cookie=domain-value; Path=/; Domain=example.test",
      ),
      "https://api.example.test/api/auth/login",
    );

    expect(jar.header("https://api.example.test/api/attendance/realtime"))
      .toContain("host_only=host-value");
    expect(jar.header("https://worker.example.test/api/attendance/realtime"))
      .toBe("domain_cookie=domain-value");
    expect(jar.header("https://example.invalid/api/attendance/realtime")).toBe("");
  });
});

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

describe("attendance smoke authentication helpers", () => {
  it("requires explicit smoke credentials without a fallback", () => {
    expect(() => requireEnvironment("TEST_EMAIL", {})).toThrow("TEST_EMAIL");
    expect(() => requireEnvironment("TEST_PASSWORD", {})).toThrow("TEST_PASSWORD");
    expect(requireEnvironment("TEST_EMAIL", { TEST_EMAIL: "operator@example.test" }))
      .toBe("operator@example.test");
  });

  it("captures login cookies and sends cookie, user CSRF, and exact Origin on mutations", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/api/auth/login")) {
        return jsonResponse(
          { user: { id: "user-1", accountId: "account-1" } },
          [
            "politicall_access=access-cookie-1; Path=/; HttpOnly; SameSite=Lax",
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

    const loginHeaders = new Headers(calls[0].init.headers);
    const mutationHeaders = new Headers(calls[1].init.headers);
    expect(loginHeaders.get("origin")).toBe("https://app.example.test");
    expect(loginHeaders.has("authorization")).toBe(false);
    expect(mutationHeaders.get("origin")).toBe("https://app.example.test");
    expect(mutationHeaders.get("cookie")).toContain("politicall_access=access-cookie-1");
    expect(mutationHeaders.get("x-csrf-token")).toBe("csrf-cookie-1");
    expect(mutationHeaders.has("authorization")).toBe(false);
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
    jar.set("politicall_access", "access-cookie");
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
        headers: { Cookie: "politicall_access=access-cookie" },
        perMessageDeflate: false,
      },
    }]);
    expect(new URL(constructed[0].url).search).toBe("");
  });
});

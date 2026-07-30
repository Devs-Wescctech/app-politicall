import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACCESS_TOKEN_MAX_AGE_MS,
  AUTH_JWT_AUDIENCE,
  AUTH_JWT_ISSUER,
  ADMIN_ACCESS_COOKIE,
  ADMIN_REFRESH_COOKIE,
  USER_ACCESS_COOKIE,
  USER_REFRESH_COOKIE,
  clearSessionCookies,
  createRefreshToken,
  issueAccessToken,
  readAccessToken,
  setSessionCookies,
} from "./auth-cookies";
import {
  GLOBAL_ADMIN_REFRESH_SESSION_MAX_AGE_MS,
  USER_REFRESH_SESSION_MAX_AGE_MS,
} from "../services/auth-session-store";

type CookieCall = [string, string, Record<string, unknown>];
type ClearCookieCall = [string, Record<string, unknown>];

function createResponse() {
  const cookie = vi.fn();
  const clearCookie = vi.fn();
  return { cookie, clearCookie };
}

function cookieByName(calls: CookieCall[], name: string): CookieCall {
  const call = calls.find(([cookieName]) => cookieName === name);
  if (!call) throw new Error(`Cookie ${name} was not set`);
  return call;
}

function clearByName(calls: ClearCookieCall[], name: string): ClearCookieCall {
  const call = calls.find(([cookieName]) => cookieName === name);
  if (!call) throw new Error(`Cookie ${name} was not cleared`);
  return call;
}

describe("auth cookie primitives", () => {
  const originalSessionSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    process.env.SESSION_SECRET = "test-session-secret-for-auth-cookie-primitives";
  });

  afterEach(() => {
    if (originalSessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSessionSecret;
  });

  it("sets isolated user and admin credentials that coexist in one browser", () => {
    const response = createResponse();

    setSessionCookies(response, {
      kind: "user",
      accessToken: "user-access",
      refreshToken: "user-refresh",
      csrfToken: "user-csrf",
    });
    setSessionCookies(response, {
      kind: "admin",
      accessToken: "admin-access",
      refreshToken: "admin-refresh",
      csrfToken: "admin-csrf",
    });

    const calls = response.cookie.mock.calls as CookieCall[];
    expect(calls.map(([name]) => name)).toEqual([
      USER_ACCESS_COOKIE,
      USER_REFRESH_COOKIE,
      "politicall_csrf",
      ADMIN_ACCESS_COOKIE,
      ADMIN_REFRESH_COOKIE,
      "politicall_admin_csrf",
    ]);
    expect(cookieByName(calls, USER_ACCESS_COOKIE)[1]).toBe("user-access");
    expect(cookieByName(calls, ADMIN_ACCESS_COOKIE)[1]).toBe("admin-access");
  });

  it("uses host-only, HttpOnly credential cookies and readable CSRF cookies with exact paths", () => {
    const response = createResponse();
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      setSessionCookies(response, {
        kind: "user",
        accessToken: "access",
        refreshToken: "refresh",
        csrfToken: "csrf",
      });
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }

    const calls = response.cookie.mock.calls as CookieCall[];
    const accessOptions = cookieByName(calls, USER_ACCESS_COOKIE)[2];
    const refreshOptions = cookieByName(calls, USER_REFRESH_COOKIE)[2];
    const csrfOptions = cookieByName(calls, "politicall_csrf")[2];
    expect(accessOptions).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: ACCESS_TOKEN_MAX_AGE_MS });
    expect(refreshOptions).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/api/auth/refresh", maxAge: USER_REFRESH_SESSION_MAX_AGE_MS });
    expect(csrfOptions).toMatchObject({ httpOnly: false, secure: true, sameSite: "lax", path: "/", maxAge: USER_REFRESH_SESSION_MAX_AGE_MS });
    expect(accessOptions).not.toHaveProperty("domain");
    expect(refreshOptions).not.toHaveProperty("domain");
    expect(csrfOptions).not.toHaveProperty("domain");
  });

  it("uses the shorter global-admin refresh lifetime and exact admin refresh path", () => {
    const response = createResponse();
    setSessionCookies(response, {
      kind: "admin",
      accessToken: "access",
      refreshToken: "refresh",
      csrfToken: "csrf",
    });

    const refreshOptions = cookieByName(response.cookie.mock.calls as CookieCall[], ADMIN_REFRESH_COOKIE)[2];
    expect(refreshOptions).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/api/admin/auth/refresh",
      maxAge: GLOBAL_ADMIN_REFRESH_SESSION_MAX_AGE_MS,
    });
  });

  it("clears every session cookie with the same security and path attributes without stale expiry attributes", () => {
    const response = createResponse();
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      clearSessionCookies(response, "admin");
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }

    const calls = response.clearCookie.mock.calls as ClearCookieCall[];
    expect(calls.map(([name]) => name)).toEqual([ADMIN_ACCESS_COOKIE, ADMIN_REFRESH_COOKIE, "politicall_admin_csrf"]);
    const accessOptions = clearByName(calls, ADMIN_ACCESS_COOKIE)[1];
    const refreshOptions = clearByName(calls, ADMIN_REFRESH_COOKIE)[1];
    const csrfOptions = clearByName(calls, "politicall_admin_csrf")[1];
    expect(accessOptions).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(refreshOptions).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/api/admin/auth/refresh" });
    expect(csrfOptions).toEqual({ httpOnly: false, secure: true, sameSite: "lax", path: "/" });
  });

  it("issues and reads only the expected HS256 access JWT claims from the matching cookie", () => {
    const token = issueAccessToken({ sid: "session-user-1", kind: "user" });
    const decoded = jwt.decode(token) as jwt.JwtPayload;

    expect(decoded).toMatchObject({ sid: "session-user-1", kind: "user", iss: AUTH_JWT_ISSUER, aud: AUTH_JWT_AUDIENCE });
    expect(decoded.exp! - decoded.iat!).toBe(ACCESS_TOKEN_MAX_AGE_MS / 1000);
    expect(readAccessToken({ headers: { cookie: `${USER_ACCESS_COOKIE}=${token}` } }, "user")).toMatchObject({ sid: "session-user-1", kind: "user" });
    expect(readAccessToken({ headers: { cookie: `${ADMIN_ACCESS_COOKIE}=${token}` } }, "admin")).toBeUndefined();
  });

  it("rejects access JWTs with a missing sid, wrong kind, issuer, audience, or algorithm", () => {
    const secret = process.env.SESSION_SECRET!;
    const common = { issuer: AUTH_JWT_ISSUER, audience: AUTH_JWT_AUDIENCE, expiresIn: "15m" as const };
    const invalidTokens = [
      jwt.sign({ kind: "user" }, secret, { ...common, algorithm: "HS256" }),
      jwt.sign({ sid: "session-1", kind: "admin" }, secret, { ...common, algorithm: "HS256" }),
      jwt.sign({ sid: "session-1", kind: "user" }, secret, { ...common, issuer: "wrong", algorithm: "HS256" }),
      jwt.sign({ sid: "session-1", kind: "user" }, secret, { ...common, audience: "wrong", algorithm: "HS256" }),
      jwt.sign({ sid: "session-1", kind: "user" }, secret, { ...common, algorithm: "HS384" }),
    ];

    for (const token of invalidTokens) {
      expect(readAccessToken({ headers: { cookie: `${USER_ACCESS_COOKIE}=${token}` } }, "user")).toBeUndefined();
    }
  });

  it("rejects correctly signed access JWTs without exact 15-minute temporal claims", () => {
    const secret = process.env.SESSION_SECRET!;
    const now = Math.floor(Date.now() / 1000);
    const options = { algorithm: "HS256" as const, issuer: AUTH_JWT_ISSUER, audience: AUTH_JWT_AUDIENCE };
    const invalidTokens = [
      jwt.sign({ sid: "session-1", kind: "user" }, secret, options),
      jwt.sign({ sid: "session-1", kind: "user", exp: now + 900 }, secret, { ...options, noTimestamp: true }),
      jwt.sign({ sid: "session-1", kind: "user", iat: now, exp: now + 901 }, secret, options),
      jwt.sign({ sid: "session-1", kind: "user", iat: now, exp: now + 899 }, secret, options),
    ];

    for (const token of invalidTokens) {
      expect(readAccessToken({ headers: { cookie: `${USER_ACCESS_COOKIE}=${token}` } }, "user")).toBeUndefined();
    }
  });

  it("parses a valid cookie header with cookie.parseCookie semantics", () => {
    const token = issueAccessToken({ sid: "session-user-2", kind: "user" });
    const request = { headers: { cookie: `theme=dark; ${USER_ACCESS_COOKIE}=${token}; malformed` } };

    expect(readAccessToken(request, "user")).toMatchObject({ sid: "session-user-2", kind: "user" });
  });

  it("creates independent 32-byte base64url refresh tokens", () => {
    const first = createRefreshToken();
    const second = createRefreshToken();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
  });
});

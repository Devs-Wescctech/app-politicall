import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_JWT_AUDIENCE, AUTH_JWT_ISSUER, issueAccessToken, USER_ACCESS_COOKIE } from "./auth-cookies";
import { ADMIN_CSRF_COOKIE, CSRF_HEADER_NAME, USER_CSRF_COOKIE, issueCsrfToken, requireCsrf } from "./csrf";

function createResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

function request(input: { method: string; origin?: string; cookie?: string; csrfHeader?: string }) {
  return {
    method: input.method,
    headers: {
      ...(input.origin === undefined ? {} : { origin: input.origin }),
      ...(input.cookie === undefined ? {} : { cookie: input.cookie }),
      ...(input.csrfHeader === undefined ? {} : { [CSRF_HEADER_NAME]: input.csrfHeader }),
    },
  };
}

describe("CSRF primitives", () => {
  const originalSessionSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    process.env.SESSION_SECRET = "test-session-secret-for-csrf-primitives";
  });

  afterEach(() => {
    if (originalSessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSessionSecret;
  });

  it("issues different session-bound tokens for user and admin sessions", () => {
    const userToken = issueCsrfToken({ sid: "session-1", kind: "user" });
    const adminToken = issueCsrfToken({ sid: "session-1", kind: "admin" });

    expect(USER_CSRF_COOKIE).toBe("politicall_csrf");
    expect(ADMIN_CSRF_COOKIE).toBe("politicall_admin_csrf");
    expect(userToken).toMatch(/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/);
    expect(adminToken).not.toBe(userToken);
  });

  it("allows a matching signed user double-submit token from an exact allowed Origin", () => {
    const accessToken = issueAccessToken({ sid: "session-user-1", kind: "user" });
    const csrfToken = issueCsrfToken({ sid: "session-user-1", kind: "user" });
    const middleware = requireCsrf({ kind: "user", allowedOrigins: ["https://app.politicall.com"] });
    const response = createResponse();
    const next = vi.fn();

    middleware(request({
      method: "POST",
      origin: "https://app.politicall.com",
      cookie: `${USER_ACCESS_COOKIE}=${accessToken}; ${USER_CSRF_COOKIE}=${csrfToken}`,
      csrfHeader: csrfToken,
    }) as never, response as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(response.status).not.toHaveBeenCalled();
  });

  it("supports an independent global-admin session in the same browser", () => {
    const userAccessToken = issueAccessToken({ sid: "session-user-2", kind: "user" });
    const adminAccessToken = issueAccessToken({ sid: "session-admin-1", kind: "admin" });
    const userCsrfToken = issueCsrfToken({ sid: "session-user-2", kind: "user" });
    const adminCsrfToken = issueCsrfToken({ sid: "session-admin-1", kind: "admin" });
    const middleware = requireCsrf({ kind: "admin", allowedOrigins: ["https://admin.politicall.com"] });
    const response = createResponse();
    const next = vi.fn();

    middleware(request({
      method: "PATCH",
      origin: "https://admin.politicall.com",
      cookie: `${USER_ACCESS_COOKIE}=${userAccessToken}; ${USER_CSRF_COOKIE}=${userCsrfToken}; politicall_admin_access=${adminAccessToken}; ${ADMIN_CSRF_COOKIE}=${adminCsrfToken}`,
      csrfHeader: adminCsrfToken,
    }) as never, response as never, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("allows refresh CSRF through a trusted asynchronous session resolver after access expiry", async () => {
    const now = Math.floor(Date.now() / 1000);
    const expiredAccessToken = jwt.sign({ sid: "session-refresh-1", kind: "user", iat: now - 901, exp: now - 1 }, process.env.SESSION_SECRET!, {
      algorithm: "HS256",
      issuer: AUTH_JWT_ISSUER,
      audience: AUTH_JWT_AUDIENCE,
    });
    const csrfToken = issueCsrfToken({ sid: "session-refresh-1", kind: "user" });
    const resolveSession = vi.fn().mockResolvedValue({ sid: "session-refresh-1", kind: "user" });
    const middleware = requireCsrf({
      kind: "user",
      allowedOrigins: ["https://app.politicall.com"],
      resolveSession,
    });
    const response = createResponse();
    const next = vi.fn();

    await middleware(request({
      method: "POST",
      origin: "https://app.politicall.com",
      cookie: `${USER_ACCESS_COOKIE}=${expiredAccessToken}; ${USER_CSRF_COOKIE}=${csrfToken}`,
      csrfHeader: csrfToken,
    }) as never, response as never, next);

    expect(resolveSession).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
    expect(response.status).not.toHaveBeenCalled();
  });

  it("rejects refresh CSRF when no trusted resolver is supplied for an expired access token", () => {
    const now = Math.floor(Date.now() / 1000);
    const expiredAccessToken = jwt.sign({ sid: "session-refresh-2", kind: "user", iat: now - 901, exp: now - 1 }, process.env.SESSION_SECRET!, {
      algorithm: "HS256",
      issuer: AUTH_JWT_ISSUER,
      audience: AUTH_JWT_AUDIENCE,
    });
    const csrfToken = issueCsrfToken({ sid: "session-refresh-2", kind: "user" });
    const middleware = requireCsrf({ kind: "user", allowedOrigins: ["https://app.politicall.com"] });
    const response = createResponse();
    const next = vi.fn();

    middleware(request({
      method: "POST",
      origin: "https://app.politicall.com",
      cookie: `${USER_ACCESS_COOKIE}=${expiredAccessToken}; ${USER_CSRF_COOKIE}=${csrfToken}`,
      csrfHeader: csrfToken,
    }) as never, response as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
  });

  it.each([
    [undefined, "undefined resolver result"],
    [{ sid: "wrong-session", kind: "user" }, "wrong session result"],
    [{ sid: "session-refresh-3", kind: "admin" }, "wrong kind result"],
  ])("rejects refresh CSRF with a %s", async (result) => {
    const csrfToken = issueCsrfToken({ sid: "session-refresh-3", kind: "user" });
    const middleware = requireCsrf({
      kind: "user",
      allowedOrigins: ["https://app.politicall.com"],
      resolveSession: () => result,
    });
    const response = createResponse();
    const next = vi.fn();

    await middleware(request({
      method: "POST",
      origin: "https://app.politicall.com",
      cookie: `${USER_CSRF_COOKIE}=${csrfToken}`,
      csrfHeader: csrfToken,
    }) as never, response as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
  });

  it("rejects refresh CSRF when the trusted resolver fails", async () => {
    const csrfToken = issueCsrfToken({ sid: "session-refresh-4", kind: "user" });
    const middleware = requireCsrf({
      kind: "user",
      allowedOrigins: ["https://app.politicall.com"],
      resolveSession: async () => { throw new Error("session lookup failed"); },
    });
    const response = createResponse();
    const next = vi.fn();

    await middleware(request({
      method: "POST",
      origin: "https://app.politicall.com",
      cookie: `${USER_CSRF_COOKIE}=${csrfToken}`,
      csrfHeader: csrfToken,
    }) as never, response as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
  });

  it("rejects tampering, a cookie/header mismatch, session binding mismatch, and kind mismatch", () => {
    const accessToken = issueAccessToken({ sid: "session-user-3", kind: "user" });
    const csrfToken = issueCsrfToken({ sid: "session-user-3", kind: "user" });
    const otherSessionToken = issueCsrfToken({ sid: "session-other", kind: "user" });
    const adminToken = issueCsrfToken({ sid: "session-user-3", kind: "admin" });
    const middleware = requireCsrf({ kind: "user", allowedOrigins: ["https://app.politicall.com"] });

    for (const [cookieToken, headerToken] of [
      [`${csrfToken}x`, `${csrfToken}x`],
      [csrfToken, otherSessionToken],
      [otherSessionToken, otherSessionToken],
      [adminToken, adminToken],
    ]) {
      const response = createResponse();
      const next = vi.fn();
      middleware(request({
        method: "DELETE",
        origin: "https://app.politicall.com",
        cookie: `${USER_ACCESS_COOKIE}=${accessToken}; ${USER_CSRF_COOKIE}=${cookieToken}`,
        csrfHeader: headerToken,
      }) as never, response as never, next);
      expect(next).not.toHaveBeenCalled();
      expect(response.status).toHaveBeenCalledWith(403);
    }
  });

  it("handles different-length comparisons without throwing", () => {
    const accessToken = issueAccessToken({ sid: "session-user-4", kind: "user" });
    const csrfToken = issueCsrfToken({ sid: "session-user-4", kind: "user" });
    const middleware = requireCsrf({ kind: "user", allowedOrigins: ["https://app.politicall.com"] });
    const response = createResponse();

    expect(() => middleware(request({
      method: "POST",
      origin: "https://app.politicall.com",
      cookie: `${USER_ACCESS_COOKIE}=${accessToken}; ${USER_CSRF_COOKIE}=${csrfToken}`,
      csrfHeader: "short",
    }) as never, response as never, vi.fn())).not.toThrow();
    expect(response.status).toHaveBeenCalledWith(403);
  });

  it("requires an exact configured Origin for mutating methods, including rejecting absent and null Origin values", () => {
    const accessToken = issueAccessToken({ sid: "session-user-5", kind: "user" });
    const csrfToken = issueCsrfToken({ sid: "session-user-5", kind: "user" });
    const middleware = requireCsrf({ kind: "user", allowedOrigins: ["https://app.politicall.com"] });

    for (const origin of [undefined, "null", "https://evil.politicall.com", "https://app.politicall.com.evil.test"]) {
      const response = createResponse();
      const next = vi.fn();
      middleware(request({
        method: "PUT",
        origin,
        cookie: `${USER_ACCESS_COOKIE}=${accessToken}; ${USER_CSRF_COOKIE}=${csrfToken}`,
        csrfHeader: csrfToken,
      }) as never, response as never, next);
      expect(next).not.toHaveBeenCalled();
      expect(response.status).toHaveBeenCalledWith(403);
    }
  });

  it.each(["GET", "HEAD", "OPTIONS"])("does not require CSRF validation for %s", (method) => {
    const middleware = requireCsrf({ kind: "user", allowedOrigins: ["https://app.politicall.com"] });
    const response = createResponse();
    const next = vi.fn();

    middleware(request({ method }) as never, response as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(response.status).not.toHaveBeenCalled();
  });
});

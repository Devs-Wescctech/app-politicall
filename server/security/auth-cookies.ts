import { randomBytes } from "node:crypto";
import type { CookieOptions, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { parseCookie } from "cookie";
import {
  GLOBAL_ADMIN_REFRESH_SESSION_MAX_AGE_MS,
  USER_REFRESH_SESSION_MAX_AGE_MS,
} from "../services/auth-session-store";

export type SessionCookieKind = "user" | "admin";

export const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;
const ACCESS_TOKEN_MAX_AGE_SECONDS = ACCESS_TOKEN_MAX_AGE_MS / 1000;
export const AUTH_JWT_ISSUER = "politicall";
export const AUTH_JWT_AUDIENCE = "politicall-api";
export const USER_ACCESS_COOKIE = "politicall_access";
export const USER_REFRESH_COOKIE = "politicall_refresh";
export const USER_CSRF_COOKIE = "politicall_csrf";
export const ADMIN_ACCESS_COOKIE = "politicall_admin_access";
export const ADMIN_REFRESH_COOKIE = "politicall_admin_refresh";
export const ADMIN_CSRF_COOKIE = "politicall_admin_csrf";

type AccessTokenClaims = JwtPayload & {
  sid: string;
  kind: SessionCookieKind;
};

type CookieResponse = Pick<Response, "cookie" | "clearCookie">;
type CookieRequest = { headers?: { cookie?: string | string[] | undefined } };

type SessionCookieNames = {
  access: string;
  refresh: string;
  csrf: string;
  refreshPath: string;
  refreshMaxAge: number;
};

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET must be set in environment variables");
  return secret;
}

function getCookieNames(kind: SessionCookieKind): SessionCookieNames {
  if (kind === "user") {
    return {
      access: USER_ACCESS_COOKIE,
      refresh: USER_REFRESH_COOKIE,
      csrf: USER_CSRF_COOKIE,
      refreshPath: "/api/auth/refresh",
      refreshMaxAge: USER_REFRESH_SESSION_MAX_AGE_MS,
    };
  }
  return {
    access: ADMIN_ACCESS_COOKIE,
    refresh: ADMIN_REFRESH_COOKIE,
    csrf: ADMIN_CSRF_COOKIE,
    refreshPath: "/api/admin/auth/refresh",
    refreshMaxAge: GLOBAL_ADMIN_REFRESH_SESSION_MAX_AGE_MS,
  };
}

function securityOptions(path: string, httpOnly: boolean, maxAge?: number): CookieOptions {
  return {
    httpOnly,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path,
    ...(maxAge === undefined ? {} : { maxAge }),
  };
}

function isAccessTokenClaims(payload: string | JwtPayload, kind: SessionCookieKind): payload is AccessTokenClaims {
  return typeof payload === "object"
    && payload !== null
    && typeof payload.sid === "string"
    && payload.sid.length > 0
    && payload.kind === kind
    && typeof payload.iat === "number"
    && typeof payload.exp === "number"
    && payload.exp - payload.iat === ACCESS_TOKEN_MAX_AGE_SECONDS;
}

export function createRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export function issueAccessToken(input: { sid: string; kind: SessionCookieKind }): string {
  if (!input.sid) throw new Error("Access tokens require a session id");
  return jwt.sign({ sid: input.sid, kind: input.kind }, getSessionSecret(), {
    algorithm: "HS256",
    issuer: AUTH_JWT_ISSUER,
    audience: AUTH_JWT_AUDIENCE,
    expiresIn: ACCESS_TOKEN_MAX_AGE_SECONDS,
  });
}

export function readAccessToken(request: CookieRequest, kind: SessionCookieKind): AccessTokenClaims | undefined {
  const cookieHeader = request.headers?.cookie;
  if (typeof cookieHeader !== "string") return undefined;

  const token = parseCookie(cookieHeader)[getCookieNames(kind).access];
  if (!token) return undefined;

  try {
    const payload = jwt.verify(token, getSessionSecret(), {
      algorithms: ["HS256"],
      issuer: AUTH_JWT_ISSUER,
      audience: AUTH_JWT_AUDIENCE,
      maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
    });
    return isAccessTokenClaims(payload, kind) ? payload : undefined;
  } catch {
    return undefined;
  }
}

export function setSessionCookies(
  response: CookieResponse,
  input: { kind: SessionCookieKind; accessToken: string; refreshToken: string; csrfToken: string },
): void {
  const names = getCookieNames(input.kind);
  response.cookie(names.access, input.accessToken, securityOptions("/", true, ACCESS_TOKEN_MAX_AGE_MS));
  response.cookie(names.refresh, input.refreshToken, securityOptions(names.refreshPath, true, names.refreshMaxAge));
  response.cookie(names.csrf, input.csrfToken, securityOptions("/", false, names.refreshMaxAge));
}

export function clearSessionCookies(response: CookieResponse, kind: SessionCookieKind): void {
  const names = getCookieNames(kind);
  response.clearCookie(names.access, securityOptions("/", true));
  response.clearCookie(names.refresh, securityOptions(names.refreshPath, true));
  response.clearCookie(names.csrf, securityOptions("/", false));
}

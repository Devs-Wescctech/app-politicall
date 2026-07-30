import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { parseCookie } from "cookie";
import {
  ADMIN_CSRF_COOKIE,
  USER_CSRF_COOKIE,
  readAccessToken,
  type SessionCookieKind,
} from "./auth-cookies";

export { ADMIN_CSRF_COOKIE, USER_CSRF_COOKIE } from "./auth-cookies";

export const CSRF_HEADER_NAME = "x-csrf-token";

type CsrfTokenInput = {
  sid: string;
  kind: SessionCookieKind;
};

export type ResolvedSessionContext = CsrfTokenInput;
export type ResolveSession = (request: Request) => ResolvedSessionContext | undefined | Promise<ResolvedSessionContext | undefined>;

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET must be set in environment variables");
  return secret;
}

function signCsrfToken(input: CsrfTokenInput & { nonce: string }): string {
  const data = `${input.sid.length}:${input.sid}${input.kind.length}:${input.kind}${input.nonce.length}:${input.nonce}`;
  return createHmac("sha256", getSessionSecret()).update(data).digest("base64url");
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest) && left.length === right.length;
}

function isValidCsrfToken(token: string, input: CsrfTokenInput): boolean {
  const [nonce, signature, ...extra] = token.split(".");
  if (!nonce || !signature || extra.length > 0) return false;
  const expected = `${nonce}.${signCsrfToken({ ...input, nonce })}`;
  return constantTimeEqual(token, expected);
}

function csrfCookieName(kind: SessionCookieKind): string {
  return kind === "user" ? USER_CSRF_COOKIE : ADMIN_CSRF_COOKIE;
}

function rejectCsrf(response: Response): void {
  response.status(403).json({ error: "Invalid CSRF token" });
}

function isResolvedSessionContext(value: unknown, kind: SessionCookieKind): value is ResolvedSessionContext {
  return typeof value === "object"
    && value !== null
    && typeof (value as ResolvedSessionContext).sid === "string"
    && (value as ResolvedSessionContext).sid.length > 0
    && (value as ResolvedSessionContext).kind === kind;
}

function isPromiseLike(value: unknown): value is Promise<ResolvedSessionContext | undefined> {
  return typeof value === "object"
    && value !== null
    && typeof (value as Promise<unknown>).then === "function";
}

export function issueCsrfToken(input: CsrfTokenInput): string {
  if (!input.sid) throw new Error("CSRF tokens require a session id");
  const nonce = randomBytes(32).toString("base64url");
  return `${nonce}.${signCsrfToken({ ...input, nonce })}`;
}

export function requireCsrf(input: {
  kind: SessionCookieKind;
  allowedOrigins: readonly string[];
  resolveSession?: ResolveSession;
}) {
  const allowedOrigins = new Set(input.allowedOrigins);
  if (allowedOrigins.size === 0) throw new Error("CSRF protection requires an explicit Origin allowlist");
  const resolveSession = input.resolveSession ?? ((request: Request) => {
    const accessToken = readAccessToken(request, input.kind);
    return accessToken ? { sid: accessToken.sid, kind: accessToken.kind } : undefined;
  });

  return (request: Request, response: Response, next: NextFunction): void | Promise<void> => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) {
      next();
      return;
    }

    const origin = request.headers.origin;
    if (typeof origin !== "string" || origin === "null" || !allowedOrigins.has(origin)) {
      rejectCsrf(response);
      return;
    }

    const headerToken = request.headers[CSRF_HEADER_NAME];
    const cookieHeader = request.headers.cookie;
    if (typeof headerToken !== "string" || typeof cookieHeader !== "string") {
      rejectCsrf(response);
      return;
    }

    const cookieToken = parseCookie(cookieHeader)[csrfCookieName(input.kind)];
    if (!cookieToken || !constantTimeEqual(headerToken, cookieToken)) {
      rejectCsrf(response);
      return;
    }

    const validateResolvedSession = (session: ResolvedSessionContext | undefined): void => {
      if (!isResolvedSessionContext(session, input.kind)
        || !isValidCsrfToken(headerToken, session)) {
        rejectCsrf(response);
        return;
      }
      next();
    };

    try {
      const session = resolveSession(request);
      if (isPromiseLike(session)) {
        return session.then(validateResolvedSession, () => rejectCsrf(response));
      }
      validateResolvedSession(session);
    } catch {
      rejectCsrf(response);
    }
  };
}

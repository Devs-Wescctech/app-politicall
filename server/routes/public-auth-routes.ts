import type { Express, Request, Response } from "express";
import { DEFAULT_PERMISSIONS, insertUserSchema, loginSchema, type User } from "@shared/schema";
import type { IStorage } from "../storage";
import type { AuthenticationRateLimiter } from "./auth-session-routes";
import type { AuthSessionUser, IssuedSessionCookies } from "../services/auth-session-service";
import { sendAuthSessionResponse } from "./auth-session-routes";

const USER_REGISTRATION_ATTEMPT_LIMIT = 10;
const USER_LOGIN_IP_ATTEMPT_LIMIT = 300;
const USER_LOGIN_EMAIL_ATTEMPT_LIMIT = 5;
const ADMIN_LOGIN_ATTEMPT_LIMIT = 10;

type UserSessionResult = { user: unknown; cookies: IssuedSessionCookies };
type AdminSessionResult = { admin: true; cookies: IssuedSessionCookies };

export type PublicAuthRouteDependencies = {
  allowedOrigins: readonly string[];
  limiter: AuthenticationRateLimiter;
  storage: {
    getUserByEmail(email: string): Promise<User | undefined>;
    createAccount(input: { name: string; salesperson?: string | null; planValue?: string | null }): Promise<{ id: string }>;
    findAvailableSlug(baseSlug: string): Promise<string>;
    createUser(input: Parameters<IStorage["createUser"]>[0]): Promise<User>;
  };
  authSessionService: {
    issueUserSession(user: AuthSessionUser, options: { deviceMetadata?: string; ipMetadata?: string }): Promise<UserSessionResult>;
    loginUser(input: { email: string; password: string; deviceMetadata?: string; ipMetadata?: string }): Promise<UserSessionResult | undefined>;
    loginAdmin(input: { password: string; deviceMetadata?: string; ipMetadata?: string }): Promise<AdminSessionResult | undefined>;
  };
  hashPassword(password: string, rounds: number): Promise<string>;
  generateSlug(name: string): string;
  toAuthSessionUser(user: User): AuthSessionUser;
};

function setNoStore(response: Response): void {
  response.set("Cache-Control", "no-store");
}

function rejectAuthentication(response: Response, status = 401): void {
  setNoStore(response);
  response.status(status).json({ error: "Authentication failed" });
}

function hasExactOrigin(request: Request, allowedOrigins: ReadonlySet<string>): boolean {
  return typeof request.headers.origin === "string" && allowedOrigins.has(request.headers.origin);
}

function requestMetadata(request: Request): { ipMetadata: string | undefined; deviceMetadata: string | undefined } {
  return { ipMetadata: request.ip || request.socket.remoteAddress, deviceMetadata: request.get("user-agent") };
}

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

function rateLimit(limiter: AuthenticationRateLimiter, scope: string, limit: number, request: Request, response: Response): boolean {
  let allowed = false;
  limiter(scope, limit)(request, response, () => { allowed = true; });
  return allowed;
}

export function registerPublicAuthRoutes(app: Express, dependencies: PublicAuthRouteDependencies): void {
  const origins = new Set(dependencies.allowedOrigins);

  app.post("/api/auth/register", async (request, response) => {
    try {
      setNoStore(response);
      if (!hasExactOrigin(request, origins)) return rejectAuthentication(response, 403);
      if (!rateLimit(dependencies.limiter, "credential:registration:ip", USER_REGISTRATION_ATTEMPT_LIMIT, request, response)) return;
      const validatedData = insertUserSchema.parse(request.body);
      if (await dependencies.storage.getUserByEmail(validatedData.email)) return rejectAuthentication(response);
      const account = await dependencies.storage.createAccount({
        name: validatedData.name || validatedData.email,
        salesperson: request.body.salesperson || null,
        planValue: request.body.planValue || null,
      });
      const user = await dependencies.storage.createUser({
        ...validatedData,
        password: await dependencies.hashPassword(validatedData.password, 10),
        accountId: account.id,
        role: "admin",
        permissions: validatedData.permissions || DEFAULT_PERMISSIONS.admin,
        partyId: undefined,
        avatar: undefined,
        slug: await dependencies.storage.findAvailableSlug(dependencies.generateSlug(validatedData.name)),
      } as Parameters<IStorage["createUser"]>[0]);
      sendAuthSessionResponse(response, await dependencies.authSessionService.issueUserSession(dependencies.toAuthSessionUser(user), requestMetadata(request)));
    } catch {
      rejectAuthentication(response, 400);
    }
  });

  app.post("/api/auth/login", async (request, response) => {
    try {
      setNoStore(response);
      if (!hasExactOrigin(request, origins)) return rejectAuthentication(response, 403);
      const validatedData = loginSchema.parse(request.body);
      if (!rateLimit(dependencies.limiter, "credential:user-login:ip", USER_LOGIN_IP_ATTEMPT_LIMIT, request, response)) return;
      if (!rateLimit(dependencies.limiter, `credential:user-login:email:${normalizedEmail(validatedData.email)}`, USER_LOGIN_EMAIL_ATTEMPT_LIMIT, request, response)) return;
      const issued = await dependencies.authSessionService.loginUser({ ...validatedData, ...requestMetadata(request) });
      if (!issued) return rejectAuthentication(response);
      sendAuthSessionResponse(response, issued);
    } catch {
      rejectAuthentication(response, 400);
    }
  });

  app.post("/api/admin/login", async (request, response) => {
    try {
      setNoStore(response);
      if (!hasExactOrigin(request, origins)) return rejectAuthentication(response, 403);
      const password = typeof request.body?.password === "string" && request.body.password;
      if (!password) return rejectAuthentication(response, 400);
      if (!rateLimit(dependencies.limiter, "credential:admin-login:ip", ADMIN_LOGIN_ATTEMPT_LIMIT, request, response)) return;
      const issued = await dependencies.authSessionService.loginAdmin({ password, ...requestMetadata(request) });
      if (!issued) return rejectAuthentication(response);
      sendAuthSessionResponse(response, issued);
    } catch {
      rejectAuthentication(response, 400);
    }
  });
}

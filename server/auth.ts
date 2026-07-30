import type { NextFunction, Request, Response } from "express";
import { storage } from "./storage";
import type { UserPermissions } from "@shared/schema";
import { getAuthAllowedOrigins } from "./routes/auth-session-routes";
import { createAuthenticationMiddleware, isActiveGlobalAdminSession, type BrowserAuthRequest } from "./security/authentication";
import { resolveAccessSession } from "./services/auth-session-store";
import { readAccessToken } from "./security/auth-cookies";

// Default permissions if user has none
const DEFAULT_USER_PERMISSIONS: UserPermissions = {
  dashboard: true,
  contacts: true,
  alliances: true,
  demands: true,
  agenda: true,
  ai: false,
  marketing: false,
  petitions: false,
  users: false,
  settings: false,
  whatsappAttendance: false,
  emailAttendance: false,
  socialAttendance: false,
  whatsappBroadcast: false,
  emailBroadcast: false,
  smsBroadcast: false,
  attendanceReports: false,
  attendanceSettings: false,
  reports: false,
  campaignReports: false,
};

// Extended request interface with user data
export interface AuthRequest extends BrowserAuthRequest {}

// Middleware to verify JWT token
const browserAuthentication = createAuthenticationMiddleware({
  allowedOrigins: getAuthAllowedOrigins,
  resolveAccessSession,
  getUser: async (userId) => {
    const user = await storage.getUser(userId);
    return user ? {
      id: user.id,
      accountId: user.accountId,
      email: user.email,
      name: user.name,
      role: user.role,
      permissions: user.permissions || DEFAULT_USER_PERMISSIONS,
    } : undefined;
  },
});

export const authenticateToken = browserAuthentication.authenticateUser;
export const authenticateAdminToken = browserAuthentication.authenticateGlobalAdmin;

// Impersonation bypasses require an independent, active global-admin cookie.
export async function hasActiveGlobalAdminCookie(request: Request): Promise<boolean> {
  const access = readAccessToken(request, "admin");
  if (!access) return false;
  const session = await resolveAccessSession({ kind: "admin", sessionId: access.sid });
  return isActiveGlobalAdminSession(session);
}

// Middleware to verify user has required permission
export function requirePermission(permission: keyof UserPermissions) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    // Assume authenticateToken já rodou e req.user existe
    if (!req.user) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }

    // Admin users always have all permissions, regardless of what's stored in database
    if (req.user.role === "admin") {
      return next();
    }

    if (!req.user.permissions || !req.user.permissions[permission]) {
      return res.status(403).json({ error: "Você não tem permissão para acessar este recurso" });
    }
    
    next();
  };
}

// Allow access if user has ANY of the listed permissions (OR logic)
export function requireAnyPermission(...permissions: (keyof UserPermissions)[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }
    if (req.user.role === "admin") {
      return next();
    }
    const hasAny = permissions.some(p => req.user!.permissions?.[p]);
    if (!hasAny) {
      return res.status(403).json({ error: "Você não tem permissão para acessar este recurso" });
    }
    next();
  };
}

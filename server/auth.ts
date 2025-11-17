import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { storage } from "./storage";
import type { UserPermissions } from "@shared/schema";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set in environment variables");
}
const JWT_SECRET = process.env.SESSION_SECRET;

// Default permissions if user has none
const DEFAULT_USER_PERMISSIONS: UserPermissions = {
  dashboard: true,
  contacts: true,
  alliances: true,
  demands: true,
  agenda: true,
  ai: false,
  marketing: false,
  users: false,
};

// Extended request interface with user data
export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
    permissions: UserPermissions;
  };
}

// Middleware to verify JWT token
export async function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Token não fornecido" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };
    req.userId = decoded.userId;
    
    // Fetch current user from database (authoritative source)
    // This ensures role and permission changes take effect immediately without requiring new login
    const user = await storage.getUser(decoded.userId);
    if (!user) {
      return res.status(403).json({ error: "Usuário não encontrado" });
    }
    
    req.userRole = user.role;
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      permissions: user.permissions || DEFAULT_USER_PERMISSIONS
    };
    
    next();
  } catch (error) {
    return res.status(403).json({ error: "Token inválido" });
  }
}

// Middleware to verify user has required permission
export function requirePermission(permission: keyof UserPermissions) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    // Assume authenticateToken já rodou e req.user existe
    if (!req.user) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }

    if (!req.user.permissions || !req.user.permissions[permission]) {
      return res.status(403).json({ error: "Você não tem permissão para acessar este recurso" });
    }
    
    next();
  };
}

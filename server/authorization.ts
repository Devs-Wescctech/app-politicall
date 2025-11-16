import { Request, Response, NextFunction } from "express";

// Role hierarchy: admin > coordenador > assessor
const roleHierarchy = {
  admin: 3,
  coordenador: 2,
  assessor: 1,
};

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
}

// Middleware to check if user has required role
export function requireRole(...allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const userRole = req.userRole || "assessor";
    
    const hasPermission = allowedRoles.some(role => {
      const requiredLevel = roleHierarchy[role as keyof typeof roleHierarchy] || 0;
      const userLevel = roleHierarchy[userRole as keyof typeof roleHierarchy] || 0;
      return userLevel >= requiredLevel;
    });

    if (!hasPermission) {
      return res.status(403).json({ 
        error: "Acesso negado. Você não tem permissão para esta ação.",
        code: "FORBIDDEN"
      });
    }

    next();
  };
}

// Helper function to check if user is admin
export function isAdmin(role: string): boolean {
  return role === "admin";
}

// Helper function to check if user can modify resource
export function canModifyResource(userRole: string, requiredRole: string): boolean {
  const userLevel = roleHierarchy[userRole as keyof typeof roleHierarchy] || 0;
  const requiredLevel = roleHierarchy[requiredRole as keyof typeof roleHierarchy] || 0;
  return userLevel >= requiredLevel;
}

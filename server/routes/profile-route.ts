import bcrypt from "bcrypt";
import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { clearSessionCookies } from "../security/auth-cookies";

type ProfileUser = { id: string; accountId: string; password: string; role?: string; [key: string]: unknown };
const profileUpdateSchema = z.object({
  name: z.string().min(2, "Nome deve ter no minimo 2 caracteres").optional(),
  phone: z.string().optional(), avatar: z.string().nullable().optional(), landingBackground: z.string().optional(),
  partyId: z.string().optional(), politicalPosition: z.string().optional(), electionNumber: z.string().optional(),
  lastElectionVotes: z.number().int().nonnegative().optional(), state: z.string().optional(), city: z.string().optional(),
  currentPassword: z.string().optional(), newPassword: z.string().min(6, "Nova senha deve ter no minimo 6 caracteres").optional(),
});

export function registerProfileRoute(app: Express, dependencies: {
  authenticateToken: RequestHandler;
  getUser(userId: string): Promise<ProfileUser | undefined>;
  updateUser(userId: string, accountId: string, data: Record<string, unknown>): Promise<ProfileUser>;
  changePassword(input: { accountId: string; userId: string; passwordHash: string; userData: Record<string, unknown> }): Promise<ProfileUser>;
  hasActiveGlobalAdminCookie(request: Parameters<RequestHandler>[0]): Promise<boolean>;
}): void {
  app.patch("/api/auth/profile", dependencies.authenticateToken, async (request: any, response) => {
    try {
      const data = profileUpdateSchema.parse(request.body);
      if (data.newPassword) {
        response.set("Cache-Control", "no-store");
        const bypass = !data.currentPassword && request.user?.role === "admin" && await dependencies.hasActiveGlobalAdminCookie(request);
        if (!data.currentPassword && !bypass) return response.status(400).json({ error: "Senha atual é obrigatória para alterar a senha" });
        const user = await dependencies.getUser(request.userId);
        if (!user) return response.status(404).json({ error: "Usuário não encontrado" });
        if (!bypass && !(await bcrypt.compare(data.currentPassword!, user.password))) return response.status(400).json({ error: "Senha atual incorreta" });
        const { currentPassword, newPassword, ...userData } = data;
        const updated = await dependencies.changePassword({ accountId: request.accountId, userId: request.userId, passwordHash: await bcrypt.hash(newPassword, 10), userData });
        const { password, ...sanitized } = updated;
        clearSessionCookies(response, "user");
        return response.json(sanitized);
      }
      const { currentPassword, newPassword, ...userData } = data;
      const updated = await dependencies.updateUser(request.userId, request.accountId, userData);
      const { password, ...sanitized } = updated;
      return response.json(sanitized);
    } catch {
      if (request.body?.newPassword) {
        response.set("Cache-Control", "no-store");
        return response.status(400).json({ error: "Authentication failed" });
      }
      return response.status(400).json({ error: "Erro ao atualizar perfil" });
    }
  });
}

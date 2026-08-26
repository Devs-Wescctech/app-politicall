import type { Express, RequestHandler } from "express";
import type { Contact360Response } from "@shared/contact-360";
import type { UserPermissions } from "@shared/schema";

export function registerContact360Route(app: Express, dependencies: {
  authenticate: RequestHandler;
  requireContacts: RequestHandler;
  getContact360(accountId: string, contactId: string, viewer: { role?: string; userId?: string; permissions?: Partial<UserPermissions> }): Promise<Contact360Response | null>;
}): void {
  app.get("/api/contacts/:id/360", dependencies.authenticate, dependencies.requireContacts, async (request: any, response) => {
    try {
      const aggregate = await dependencies.getContact360(request.accountId, request.params.id, {
        role: request.user?.role,
        userId: request.userId,
        permissions: request.user?.permissions,
      });
      if (!aggregate) {
        return response.status(404).json({ code: "CONTACT_NOT_FOUND", error: "Eleitor nao encontrado" });
      }
      response.set("Cache-Control", "no-store");
      return response.json(aggregate);
    } catch (error) {
      console.error("Erro ao carregar ficha 360:", error);
      return response.status(500).json({ code: "CONTACT_360_LOAD_FAILED", error: "Nao foi possivel carregar a ficha do eleitor" });
    }
  });
}

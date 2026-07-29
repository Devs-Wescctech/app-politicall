import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import {
  accounts,
  insertAllianceInviteSchema,
  insertPoliticalAllianceSchema,
  politicalParties,
} from "@shared/schema";
import { authenticateToken, requirePermission, type AuthRequest } from "../auth";
import { db } from "../db";
import { generateAllianceInviteToken } from "../services/alliance-invites";
import { storage } from "../storage";

export function registerAllianceRoutes(app: Express) {
  app.get("/api/parties", authenticateToken, requirePermission("alliances"), async (_req: AuthRequest, res) => {
    try {
      const parties = await storage.getAllParties();
      res.json(parties);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/alliances", authenticateToken, requirePermission("alliances"), async (req: AuthRequest, res) => {
    try {
      const [alliances, parties] = await Promise.all([
        storage.getAlliances(req.accountId!),
        storage.getAllParties(),
      ]);
      const partiesMap = new Map(parties.map((party) => [party.id, party]));

      res.json(alliances.map((alliance) => ({
        ...alliance,
        party: partiesMap.get(alliance.partyId),
      })));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/alliances", authenticateToken, requirePermission("alliances"), async (req: AuthRequest, res) => {
    try {
      const validatedData = insertPoliticalAllianceSchema.parse(req.body);
      const alliance = await storage.createAlliance({
        ...validatedData,
        userId: req.userId!,
        accountId: req.accountId!,
      });
      res.json(alliance);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/alliances/:id", authenticateToken, requirePermission("alliances"), async (req: AuthRequest, res) => {
    try {
      const validatedData = insertPoliticalAllianceSchema.partial().parse(req.body);
      const alliance = await storage.updateAlliance(req.params.id, req.accountId!, validatedData);
      res.json(alliance);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/alliances/:id", authenticateToken, requirePermission("alliances"), async (req: AuthRequest, res) => {
    try {
      await storage.deleteAlliance(req.params.id, req.accountId!);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/alliance-invites", authenticateToken, requirePermission("alliances"), async (req: AuthRequest, res) => {
    try {
      const invites = await storage.getAllianceInvites(req.accountId!);
      res.json(invites);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/alliance-invites", authenticateToken, requirePermission("alliances"), async (req: AuthRequest, res) => {
    try {
      const validatedData = insertAllianceInviteSchema.parse(req.body);
      const invite = await storage.createAllianceInvite({
        ...validatedData,
        userId: req.userId!,
        accountId: req.accountId!,
        token: generateAllianceInviteToken(),
      });

      res.json(invite);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/alliance-invites/:token/public", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const invite = await storage.getAllianceInviteByToken(token);

      if (!invite) return res.status(404).json({ error: "Convite não encontrado" });
      if (invite.status === "expired") return res.status(410).json({ error: "Convite expirado" });
      if (invite.status === "accepted") return res.status(410).json({ error: "Convite já foi aceito" });

      const inviter = await storage.getUser(invite.userId);
      const party = await db.select().from(politicalParties).where(eq(politicalParties.id, invite.partyId));
      const [account] = await db.select().from(accounts).where(eq(accounts.id, invite.accountId));
      const admin = await storage.getAccountAdmin(invite.accountId);

      res.json({
        invite: {
          id: invite.id,
          status: invite.status,
          inviteeEmail: invite.inviteeEmail,
          inviteePhone: invite.inviteePhone,
          createdAt: invite.createdAt,
        },
        inviter: inviter ? {
          name: inviter.name,
          avatar: inviter.avatar,
          politicalPosition: inviter.politicalPosition,
          city: inviter.city,
          state: inviter.state,
        } : null,
        party: party.length > 0 ? {
          id: party[0].id,
          name: party[0].name,
          acronym: party[0].acronym,
          ideology: party[0].ideology,
        } : null,
        account: account ? { name: account.name } : null,
        admin: admin ? {
          name: admin.name,
          avatar: admin.avatar,
          politicalPosition: admin.politicalPosition,
          city: admin.city,
          state: admin.state,
        } : null,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/alliance-invites/:token/accept", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const { inviteeName, inviteeEmail, inviteePhone, inviteePosition, inviteeState, inviteeCity, inviteeNotes } = req.body;

      if (!inviteeName || inviteeName.trim().length < 2) {
        return res.status(400).json({ error: "Nome é obrigatório" });
      }

      const updatedInvite = await storage.acceptAllianceInvite(token, {
        inviteeName: inviteeName.trim(),
        inviteeEmail: inviteeEmail?.trim() || undefined,
        inviteePhone: inviteePhone?.trim() || undefined,
        inviteePosition: inviteePosition?.trim() || undefined,
        inviteeState: inviteeState?.trim() || undefined,
        inviteeCity: inviteeCity?.trim() || undefined,
        inviteeNotes: inviteeNotes?.trim() || undefined,
      });

      res.json({ success: true, invite: updatedInvite });
    } catch (error: any) {
      if (error.message === "Convite não encontrado") return res.status(404).json({ error: error.message });
      if (error.message === "Convite já foi aceito" || error.message === "Convite expirado") {
        return res.status(410).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/alliance-invites/:token/reject", async (req: Request, res: Response) => {
    try {
      const updatedInvite = await storage.rejectAllianceInvite(req.params.token);
      res.json({ success: true, invite: updatedInvite });
    } catch (error: any) {
      if (error.message === "Convite não encontrado") return res.status(404).json({ error: error.message });
      if (error.message === "Convite já foi aceito" || error.message === "Convite já foi rejeitado") {
        return res.status(410).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/alliance-invites/:id", authenticateToken, requirePermission("alliances"), async (req: AuthRequest, res) => {
    try {
      await storage.deleteAllianceInvite(req.params.id, req.accountId!);
      res.json({ success: true });
    } catch (error: any) {
      if (error.message === "Convite não encontrado ou acesso negado") {
        return res.status(404).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  });
}

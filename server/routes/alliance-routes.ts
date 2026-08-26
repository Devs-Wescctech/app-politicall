import type { Express, Request, RequestHandler, Response } from "express";
import { eq } from "drizzle-orm";
import {
  accounts,
  insertAllianceInviteSchema,
  insertPoliticalAllianceSchema,
  politicalParties,
} from "@shared/schema";
import { allianceLineIdSchema, insertAllianceLineSchema, reorderAllianceLinesSchema, updateAllianceLineSchema } from "@shared/alliance-lines";
import { authenticateToken, requirePermission, type AuthRequest } from "../auth";
import { db } from "../db";
import { generateAllianceInviteToken } from "../services/alliance-invites";
import { AllianceLineError, createAllianceLineService } from "../services/alliance-line-service";
import { storage } from "../storage";

type AllianceRoutesStorage = Pick<typeof storage,
  "getAllParties" | "getAlliances" | "createAlliance" | "updateAlliance" | "deleteAlliance" |
  "getAllianceInvites" | "createAllianceInvite" | "getAllianceInviteByToken" | "getUser" |
  "getAccountAdmin" | "acceptAllianceInvite" | "rejectAllianceInvite" | "deleteAllianceInvite" |
  "getAllianceLines" | "getAllianceLine" | "getAllianceLineByName" | "createAllianceLine" |
  "updateAllianceLine" | "reorderAllianceLines" | "countAlliancesByLine" | "deleteAllianceLine"
>;

type AllianceRoutesDependencies = {
  authenticate?: RequestHandler;
  requireAlliances?: RequestHandler;
  storage?: AllianceRoutesStorage;
  lineService?: ReturnType<typeof createAllianceLineService>;
};

const lineErrorStatus: Record<AllianceLineError["code"], number> = {
  ALLIANCE_LINE_DUPLICATE: 409,
  ALLIANCE_LINE_NOT_FOUND: 404,
  ALLIANCE_LINE_REORDER_INVALID: 400,
  ALLIANCE_LINE_IN_USE: 409,
  ALLIANCE_LINE_INVALID: 400,
};

function handleAllianceLineError(response: Response, error: unknown): Response {
  if (error instanceof AllianceLineError) {
    return response.status(lineErrorStatus[error.code]).json({ code: error.code, error: error.message });
  }
  console.error("Alliance line route failed:", error);
  return response.status(500).json({ code: "ALLIANCE_LINE_INTERNAL_ERROR", error: "Nao foi possivel processar as linhas politicas" });
}

export function registerAllianceRoutes(app: Express, dependencies: AllianceRoutesDependencies = {}) {
  const authenticate = dependencies.authenticate ?? authenticateToken;
  const requireAlliances = dependencies.requireAlliances ?? requirePermission("alliances");
  const allianceStorage = dependencies.storage ?? storage;
  const lineService = dependencies.lineService ?? createAllianceLineService({
    list: (accountId, includeInactive) => allianceStorage.getAllianceLines(accountId, includeInactive),
    findById: (accountId, id) => allianceStorage.getAllianceLine(accountId, id),
    findByName: (accountId, name) => allianceStorage.getAllianceLineByName(accountId, name),
    create: (input) => allianceStorage.createAllianceLine(input),
    update: (accountId, id, data) => allianceStorage.updateAllianceLine(accountId, id, data),
    reorder: (accountId, ids) => allianceStorage.reorderAllianceLines(accountId, ids),
    countAlliances: (accountId, lineId) => allianceStorage.countAlliancesByLine(accountId, lineId),
    delete: (accountId, id) => allianceStorage.deleteAllianceLine(accountId, id),
  });
  const secured = [authenticate, requireAlliances] as const;

  app.get("/api/alliance-lines", ...secured, async (req: AuthRequest, res) => {
    try {
      return res.json(await lineService.list({ accountId: req.accountId!, includeInactive: req.query.includeInactive === "true" }));
    } catch (error) {
      return handleAllianceLineError(res, error);
    }
  });

  app.post("/api/alliance-lines", ...secured, async (req: AuthRequest, res) => {
    const parsed = insertAllianceLineSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ code: "ALLIANCE_LINE_INVALID", error: "Dados da linha politica invalidos" });
    try {
      return res.status(201).json(await lineService.create({ accountId: req.accountId!, userId: req.userId!, data: parsed.data }));
    } catch (error) {
      return handleAllianceLineError(res, error);
    }
  });

  app.patch("/api/alliance-lines/:id", ...secured, async (req: AuthRequest, res) => {
    const id = allianceLineIdSchema.safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ code: "ALLIANCE_LINE_INVALID", error: "ID da linha politica invalido" });
    const parsed = updateAllianceLineSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ code: "ALLIANCE_LINE_INVALID", error: "Dados da linha politica invalidos" });
    try {
      return res.json(await lineService.update({ accountId: req.accountId!, id: id.data, data: parsed.data }));
    } catch (error) {
      return handleAllianceLineError(res, error);
    }
  });

  app.put("/api/alliance-lines/reorder", ...secured, async (req: AuthRequest, res) => {
    const parsed = reorderAllianceLinesSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ code: "ALLIANCE_LINE_REORDER_INVALID", error: "Ordem das linhas politicas invalida" });
    try {
      await lineService.reorder({ accountId: req.accountId!, ids: parsed.data.ids });
      return res.json({ success: true });
    } catch (error) {
      return handleAllianceLineError(res, error);
    }
  });

  app.delete("/api/alliance-lines/:id", ...secured, async (req: AuthRequest, res) => {
    const id = allianceLineIdSchema.safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ code: "ALLIANCE_LINE_INVALID", error: "ID da linha politica invalido" });
    try {
      await lineService.delete({ accountId: req.accountId!, id: id.data });
      return res.json({ success: true });
    } catch (error) {
      return handleAllianceLineError(res, error);
    }
  });

  app.get("/api/parties", ...secured, async (_req: AuthRequest, res) => {
    try {
      const parties = await allianceStorage.getAllParties();
      res.json(parties);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/alliances", ...secured, async (req: AuthRequest, res) => {
    try {
      const [alliances, parties] = await Promise.all([
        allianceStorage.getAlliances(req.accountId!),
        allianceStorage.getAllParties(),
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

  app.post("/api/alliances", ...secured, async (req: AuthRequest, res) => {
    try {
      const validatedData = insertPoliticalAllianceSchema.parse(req.body);
      await lineService.assertAssignable({ accountId: req.accountId!, lineId: validatedData.lineId });
      const alliance = await allianceStorage.createAlliance({
        ...validatedData,
        userId: req.userId!,
        accountId: req.accountId!,
      });
      res.json(alliance);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/alliances/:id", ...secured, async (req: AuthRequest, res) => {
    try {
      const validatedData = insertPoliticalAllianceSchema.partial().parse(req.body);
      if (Object.prototype.hasOwnProperty.call(validatedData, "lineId")) {
        await lineService.assertAssignable({ accountId: req.accountId!, lineId: validatedData.lineId });
      }
      const alliance = await allianceStorage.updateAlliance(req.params.id, req.accountId!, validatedData);
      res.json(alliance);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/alliances/:id", ...secured, async (req: AuthRequest, res) => {
    try {
      await allianceStorage.deleteAlliance(req.params.id, req.accountId!);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/alliance-invites", ...secured, async (req: AuthRequest, res) => {
    try {
      const invites = await allianceStorage.getAllianceInvites(req.accountId!);
      res.json(invites);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/alliance-invites", ...secured, async (req: AuthRequest, res) => {
    try {
      const validatedData = insertAllianceInviteSchema.parse(req.body);
      const invite = await allianceStorage.createAllianceInvite({
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

  app.delete("/api/alliance-invites/:id", ...secured, async (req: AuthRequest, res) => {
    try {
      await allianceStorage.deleteAllianceInvite(req.params.id, req.accountId!);
      res.json({ success: true });
    } catch (error: any) {
      if (error.message === "Convite não encontrado ou acesso negado") {
        return res.status(404).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  });
}

import type { Express } from "express";
import { insertPetitionCampaignLogSchema } from "@shared/schema";
import { z } from "zod";
import { authenticateToken, requirePermission, type AuthRequest } from "../auth";
import { storage } from "../storage";

export function registerPetitionCampaignLogRoutes(app: Express) {
  app.get("/api/petition-campaigns/:id/logs", authenticateToken, requirePermission("petitions"), async (req: AuthRequest, res) => {
    try {
      const logs = await storage.getPetitionCampaignLogs(req.params.id, req.accountId!);
      res.json(logs);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/petition-campaigns/:id/logs", authenticateToken, requirePermission("petitions"), async (req: AuthRequest, res) => {
    try {
      const campaign = await storage.getPetitionCampaign(req.params.id, req.accountId!);
      if (!campaign) return res.status(404).json({ error: "Campanha não encontrada" });

      const validated = insertPetitionCampaignLogSchema.parse({ ...req.body, campaignId: req.params.id });
      const log = await storage.createPetitionCampaignLog({ ...validated, accountId: req.accountId! });
      res.status(201).json(log);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Dados inválidos", details: error.errors });
      }
      res.status(400).json({ error: error.message });
    }
  });
}

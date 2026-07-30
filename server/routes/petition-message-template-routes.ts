import type { Express } from "express";
import { insertPetitionMessageTemplateSchema } from "@shared/schema";
import { z } from "zod";
import { authenticateToken, requirePermission, type AuthRequest } from "../auth";
import { storage } from "../storage";

export function registerPetitionMessageTemplateRoutes(app: Express) {
  app.get("/api/petition-message-templates", authenticateToken, requirePermission("petitions"), async (req: AuthRequest, res) => {
    try {
      res.json(await storage.getPetitionMessageTemplates(req.accountId!));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/petition-message-templates", authenticateToken, requirePermission("petitions"), async (req: AuthRequest, res) => {
    try {
      const validated = insertPetitionMessageTemplateSchema.parse(req.body);
      const template = await storage.createPetitionMessageTemplate({
        ...validated,
        userId: req.userId!,
        accountId: req.accountId!,
      });
      res.status(201).json(template);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Dados inválidos", details: error.errors });
      }
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/petition-message-templates/:id", authenticateToken, requirePermission("petitions"), async (req: AuthRequest, res) => {
    try {
      const validated = insertPetitionMessageTemplateSchema.partial().parse(req.body);
      const template = await storage.updatePetitionMessageTemplate(req.params.id, req.accountId!, validated);
      res.json(template);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Dados inválidos", details: error.errors });
      }
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/petition-message-templates/:id", authenticateToken, requirePermission("petitions"), async (req: AuthRequest, res) => {
    try {
      await storage.deletePetitionMessageTemplate(req.params.id, req.accountId!);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });
}

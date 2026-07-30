import type { Express } from "express";
import { insertLinkBioPageSchema, insertLinkTreePageSchema } from "@shared/schema";
import { z } from "zod";
import { authenticateToken, requirePermission, type AuthRequest } from "../auth";
import { makeUniqueSlug } from "../services/slugs";
import { storage } from "../storage";

export function registerLinkPageRoutes(app: Express) {
  app.get("/api/linkbio-pages", authenticateToken, requirePermission("petitions"), async (req: AuthRequest, res) => {
    try {
      res.json(await storage.getLinkBioPages(req.accountId!));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/linkbio-pages/:id", authenticateToken, requirePermission("petitions"), async (req: AuthRequest, res) => {
    try {
      const page = await storage.getLinkBioPage(req.params.id, req.accountId!);
      if (!page) return res.status(404).json({ error: "Página não encontrada" });
      res.json(page);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/linkbio-pages", authenticateToken, requirePermission("petitions"), async (req: AuthRequest, res) => {
    try {
      const validated = insertLinkBioPageSchema.parse(req.body);
      const slug = await makeUniqueSlug(validated.slug, (s) => storage.getLinkBioPageBySlug(s));
      const page = await storage.createLinkBioPage({
        ...validated,
        slug,
        userId: req.userId!,
        accountId: req.accountId!,
      });
      res.status(201).json(page);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Dados inválidos", details: error.errors });
      }
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/linkbio-pages/:id", authenticateToken, requirePermission("petitions"), async (req: AuthRequest, res) => {
    try {
      const validated = insertLinkBioPageSchema.partial().parse(req.body);
      if (validated.slug) {
        validated.slug = await makeUniqueSlug(validated.slug, (s) => storage.getLinkBioPageBySlug(s), req.params.id);
      }
      const page = await storage.updateLinkBioPage(req.params.id, req.accountId!, validated);
      res.json(page);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Dados inválidos", details: error.errors });
      }
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/linkbio-pages/:id", authenticateToken, requirePermission("petitions"), async (req: AuthRequest, res) => {
    try {
      await storage.deleteLinkBioPage(req.params.id, req.accountId!);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/linktree-pages", authenticateToken, requirePermission("petitions"), async (req: AuthRequest, res) => {
    try {
      res.json(await storage.getLinkTreePages(req.accountId!));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/linktree-pages/:id", authenticateToken, requirePermission("petitions"), async (req: AuthRequest, res) => {
    try {
      const page = await storage.getLinkTreePage(req.params.id, req.accountId!);
      if (!page) return res.status(404).json({ error: "Página não encontrada" });
      res.json(page);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/linktree-pages", authenticateToken, requirePermission("petitions"), async (req: AuthRequest, res) => {
    try {
      const validated = insertLinkTreePageSchema.parse(req.body);
      const slug = await makeUniqueSlug(validated.slug, (s) => storage.getLinkTreePageBySlug(s));
      const page = await storage.createLinkTreePage({
        ...validated,
        slug,
        userId: req.userId!,
        accountId: req.accountId!,
      });
      res.status(201).json(page);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Dados inválidos", details: error.errors });
      }
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/linktree-pages/:id", authenticateToken, requirePermission("petitions"), async (req: AuthRequest, res) => {
    try {
      const validated = insertLinkTreePageSchema.partial().parse(req.body);
      if (validated.slug) {
        validated.slug = await makeUniqueSlug(validated.slug, (s) => storage.getLinkTreePageBySlug(s), req.params.id);
      }
      const page = await storage.updateLinkTreePage(req.params.id, req.accountId!, validated);
      res.json(page);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Dados inválidos", details: error.errors });
      }
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/linktree-pages/:id", authenticateToken, requirePermission("petitions"), async (req: AuthRequest, res) => {
    try {
      await storage.deleteLinkTreePage(req.params.id, req.accountId!);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });
}

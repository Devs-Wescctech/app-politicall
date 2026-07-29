import type { Express } from "express";
import { and, eq } from "drizzle-orm";
import { insertContactSchema, insertPoliticalAllianceSchema, users } from "@shared/schema";
import { authenticateToken, requirePermission, type AuthRequest } from "../auth";
import { authenticateApiKey, apiRateLimit, type AuthenticatedApiRequest } from "../auth-api";
import { db } from "../db";
import { storage } from "../storage";

export function registerApiKeyRoutes(app: Express) {
  app.get("/api/keys", authenticateToken, requirePermission("settings"), async (req: AuthRequest, res) => {
    try {
      const keys = await storage.getApiKeys(req.accountId!);
      const safeKeys = keys.map(({ hashedKey, ...key }) => key);
      res.json(safeKeys);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/keys", authenticateToken, requirePermission("settings"), async (req: AuthRequest, res) => {
    try {
      const { name, description, expiresAt } = req.body;

      if (!name || name.length < 3) {
        return res.status(400).json({ error: "Nome deve ter pelo menos 3 caracteres" });
      }

      const { apiKey, plainKey } = await storage.createApiKey({
        accountId: req.accountId!,
        name,
        description,
        expiresAt,
        isActive: true,
      });

      res.json({
        ...apiKey,
        key: plainKey,
        message: "Guarde esta chave com segurança. Ela não será mostrada novamente.",
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/keys/:id", authenticateToken, requirePermission("settings"), async (req: AuthRequest, res) => {
    try {
      await storage.deleteApiKey(req.params.id, req.accountId!);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/v1/contacts", authenticateApiKey, apiRateLimit(100, 60000), async (req: AuthenticatedApiRequest, res) => {
    try {
      const contacts = await storage.getContacts(req.apiKey!.accountId);
      res.json(contacts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/v1/contacts", authenticateApiKey, apiRateLimit(50, 60000), async (req: AuthenticatedApiRequest, res) => {
    try {
      const validation = insertContactSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors });
      }

      const accountUsers = await db.select()
        .from(users)
        .where(and(
          eq(users.accountId, req.apiKey!.accountId),
          eq(users.role, "admin"),
        ));

      const adminUser = accountUsers[0];

      if (!adminUser) {
        return res.status(500).json({ error: "No admin user found for this account" });
      }

      const contact = await storage.createContact({
        ...validation.data,
        accountId: req.apiKey!.accountId,
        userId: adminUser.id,
      });

      res.status(201).json(contact);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/v1/contacts/:id", authenticateApiKey, apiRateLimit(100, 60000), async (req: AuthenticatedApiRequest, res) => {
    try {
      const contact = await storage.getContact(req.params.id, req.apiKey!.accountId);
      if (!contact) {
        return res.status(404).json({ error: "Contato não encontrado" });
      }
      res.json(contact);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/v1/alliances", authenticateApiKey, apiRateLimit(100, 60000), async (req: AuthenticatedApiRequest, res) => {
    try {
      const alliances = await storage.getAlliances(req.apiKey!.accountId);
      res.json(alliances);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/v1/alliances", authenticateApiKey, apiRateLimit(50, 60000), async (req: AuthenticatedApiRequest, res) => {
    try {
      const validation = insertPoliticalAllianceSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors });
      }

      const alliance = await storage.createAlliance({
        ...validation.data,
        accountId: req.apiKey!.accountId,
        userId: "system-api-user",
      });

      res.status(201).json(alliance);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/v1/demands", authenticateApiKey, apiRateLimit(100, 60000), async (req: AuthenticatedApiRequest, res) => {
    try {
      const demands = await storage.getDemands(req.apiKey!.accountId);
      res.json(demands);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/v1/events", authenticateApiKey, apiRateLimit(100, 60000), async (req: AuthenticatedApiRequest, res) => {
    try {
      const events = await storage.getEvents(req.apiKey!.accountId);
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/v1/parties", authenticateApiKey, apiRateLimit(100, 60000), async (_req: AuthenticatedApiRequest, res) => {
    try {
      const parties = await storage.getAllParties();
      res.json(parties);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}

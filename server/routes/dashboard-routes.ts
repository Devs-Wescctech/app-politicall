import type { Express } from "express";
import { authenticateToken, type AuthRequest } from "../auth";
import { buildDashboardStats } from "../services/dashboard-stats";
import { storage } from "../storage";

export function registerDashboardRoutes(app: Express) {
  app.get("/api/dashboard/stats", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const [contacts, alliances, demands, events, parties] = await Promise.all([
        storage.getContacts(req.accountId!),
        storage.getAlliances(req.accountId!),
        storage.getDemands(req.accountId!),
        storage.getEvents(req.accountId!),
        storage.getAllParties(),
      ]);

      res.json(buildDashboardStats(contacts, alliances, demands, events, parties));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}

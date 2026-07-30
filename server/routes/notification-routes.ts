import type { Express } from "express";
import { insertNotificationSchema } from "@shared/schema";
import { authenticateToken, type AuthRequest } from "../auth";
import { storage } from "../storage";

export function registerNotificationRoutes(app: Express) {
  app.get("/api/notifications", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const notifications = await storage.getNotifications(req.userId!, req.accountId!, limit);
      res.json(notifications);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/notifications/unread-count", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const count = await storage.getUnreadCount(req.userId!, req.accountId!);
      res.json({ count });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/notifications", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const validatedData = insertNotificationSchema.parse(req.body);
      const notification = await storage.createNotification({
        ...validatedData,
        userId: req.userId!,
        accountId: req.accountId!,
      });
      res.json(notification);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/notifications/:id/read", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const notification = await storage.markAsRead(req.params.id, req.userId!, req.accountId!);
      if (!notification) {
        return res.status(404).json({ error: "Notificação não encontrada ou não pertence a você" });
      }
      res.json(notification);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/notifications/mark-all-read", authenticateToken, async (req: AuthRequest, res) => {
    try {
      await storage.markAllAsRead(req.userId!, req.accountId!);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/notifications/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const deleted = await storage.deleteNotification(req.params.id, req.userId!, req.accountId!);
      if (!deleted) {
        return res.status(404).json({ error: "Notificação não encontrada ou não pertence a você" });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });
}

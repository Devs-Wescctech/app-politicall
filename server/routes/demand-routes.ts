import type { Express, RequestHandler } from "express";
import { and, eq } from "drizzle-orm";
import multer from "multer";
import { z, ZodError } from "zod";
import { contacts, demandCategories, insertDemandCategorySchema, insertDemandCommentSchema, insertDemandDestinationSchema, insertDemandForwardingSchema, insertDemandSchema, users } from "@shared/schema";
import { authenticateToken, requirePermission, type AuthRequest } from "../auth";
import { db } from "../db";
import { storage } from "../storage";
import {
  createDemand,
  createDemandFollowUp,
  deleteDemand,
  DemandDomainError,
  getDemandHistory,
  getDemandSummary,
  listDemands,
  updateDemand,
} from "../services/demands";
import {
  createDemandAttachment,
  deleteDemandAttachment,
  getDemandAttachment,
  listDemandAttachments,
} from "../services/demand-attachments";
import { DEMAND_ATTACHMENT_MAX_BYTES } from "../services/demand-automation-domain";
import { createDemandDestination, listDemandDestinations, updateDemandDestination } from "../services/demand-destinations";
import { createDemandForwarding, createForwardingCitizenDraft, listDemandForwardings, updateDemandForwarding } from "../services/demand-forwardings";

const followUpSchema = z.object({
  forwardingId: z.string().uuid().optional(),
  title: z.string().trim().min(2).max(120).optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  reminderMinutes: z.number().int().min(0).max(10080).optional(),
});

const destinationFiltersSchema = z.object({
  kind: z.enum(["internal", "external"]).optional(),
  active: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
});

function sendError(res: any, error: unknown) {
  if (error instanceof multer.MulterError) {
    const message = error.code === "LIMIT_FILE_SIZE" ? "O arquivo deve ter no maximo 10 MB" : "Nao foi possivel receber o arquivo";
    return res.status(400).json({ error: message, code: "ATTACHMENT_INVALID" });
  }
  if (error instanceof DemandDomainError) return res.status(error.status).json({ error: error.message, code: error.code });
  if (error instanceof ZodError) return res.status(400).json({ error: error.issues[0]?.message ?? "Dados invalidos", code: "VALIDATION_ERROR" });
  console.error("Demand route failed:", error);
  return res.status(500).json({ error: "Nao foi possivel processar a demanda", code: "DEMAND_INTERNAL_ERROR" });
}

const attachmentUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: DEMAND_ATTACHMENT_MAX_BYTES } });
const receiveAttachment: RequestHandler = (req, res, next) => {
  attachmentUpload.single("file")(req, res, (error) => error ? sendError(res, error) : next());
};

export function registerDemandRoutes(app: Express) {
  const guard = [authenticateToken, requirePermission("demands")] as const;

  app.get("/api/demand-destinations", ...guard, async (req: AuthRequest, res) => {
    try { res.json(await listDemandDestinations(req.accountId!, destinationFiltersSchema.parse(req.query))); }
    catch (error) { sendError(res, error); }
  });

  app.post("/api/demand-destinations", ...guard, async (req: AuthRequest, res) => {
    try { res.status(201).json(await createDemandDestination(req.accountId!, req.userId!, insertDemandDestinationSchema.parse(req.body))); }
    catch (error) { sendError(res, error); }
  });

  app.patch("/api/demand-destinations/:id", ...guard, async (req: AuthRequest, res) => {
    try { res.json(await updateDemandDestination(req.accountId!, req.params.id, insertDemandDestinationSchema.partial().parse(req.body))); }
    catch (error) { sendError(res, error); }
  });

  app.get("/api/demands/:id/forwardings", ...guard, async (req: AuthRequest, res) => {
    try { res.json(await listDemandForwardings(req.accountId!, req.params.id)); }
    catch (error) { sendError(res, error); }
  });

  app.post("/api/demands/:id/forwardings", ...guard, async (req: AuthRequest, res) => {
    try { res.status(201).json(await createDemandForwarding(req.accountId!, req.userId!, req.params.id, insertDemandForwardingSchema.parse(req.body))); }
    catch (error) { sendError(res, error); }
  });

  app.patch("/api/demands/:id/forwardings/:forwardingId", ...guard, async (req: AuthRequest, res) => {
    try { res.json(await updateDemandForwarding(req.accountId!, req.userId!, req.params.id, req.params.forwardingId, insertDemandForwardingSchema.partial().parse(req.body))); }
    catch (error) { sendError(res, error); }
  });

  app.post("/api/demands/:id/forwardings/:forwardingId/message-draft", ...guard, async (req: AuthRequest, res) => {
    try { res.json(await createForwardingCitizenDraft(req.accountId!, req.params.id, req.params.forwardingId)); }
    catch (error) { sendError(res, error); }
  });

  app.get("/api/demands", ...guard, async (req: AuthRequest, res) => {
    try { res.json(await listDemands(req.accountId!)); } catch (error) { sendError(res, error); }
  });

  app.get("/api/demands/summary", ...guard, async (req: AuthRequest, res) => {
    try { res.json(await getDemandSummary(req.accountId!)); } catch (error) { sendError(res, error); }
  });

  app.post("/api/demands", ...guard, async (req: AuthRequest, res) => {
    try {
      const demand = await createDemand(req.accountId!, req.userId!, insertDemandSchema.parse(req.body));
      if (demand.priority === "urgent") {
        storage.createNotification({
          userId: demand.assigneeUserId ?? req.userId!, accountId: req.accountId!, type: "demand",
          title: "Demanda urgente criada", message: `${demand.protocol}: ${demand.title}`,
          priority: "urgent", isRead: false, link: "/demands",
        }).catch((error) => console.error("Demand notification failed:", error));
      }
      res.status(201).json(demand);
    } catch (error) { sendError(res, error); }
  });

  app.patch("/api/demands/:id", ...guard, async (req: AuthRequest, res) => {
    try { res.json(await updateDemand(req.accountId!, req.userId!, req.params.id, insertDemandSchema.partial().parse(req.body))); }
    catch (error) { sendError(res, error); }
  });

  app.delete("/api/demands/:id", ...guard, async (req: AuthRequest, res) => {
    try { await deleteDemand(req.accountId!, req.params.id); res.status(204).end(); }
    catch (error) { sendError(res, error); }
  });

  app.get("/api/demands/:id/comments", ...guard, async (req: AuthRequest, res) => {
    try { res.json(await storage.getDemandComments(req.params.id, req.accountId!)); }
    catch (error) { sendError(res, error); }
  });

  app.post("/api/demands/:id/comments", ...guard, async (req: AuthRequest, res) => {
    try {
      const input = insertDemandCommentSchema.parse({ ...req.body, demandId: req.params.id });
      const comment = await storage.createDemandComment({ ...input, demandId: req.params.id, userId: req.userId!, accountId: req.accountId! });
      res.status(201).json(comment);
    } catch (error) { sendError(res, error); }
  });

  app.get("/api/demands/:id/history", ...guard, async (req: AuthRequest, res) => {
    try { res.json(await getDemandHistory(req.accountId!, req.params.id)); }
    catch (error) { sendError(res, error); }
  });

  app.post("/api/demands/:id/follow-up", ...guard, async (req: AuthRequest, res) => {
    try { res.status(201).json(await createDemandFollowUp(req.accountId!, req.userId!, req.params.id, followUpSchema.parse(req.body))); }
    catch (error) { sendError(res, error); }
  });

  app.get("/api/demands/:id/attachments", ...guard, async (req: AuthRequest, res) => {
    try { res.json(await listDemandAttachments(req.accountId!, req.params.id)); }
    catch (error) { sendError(res, error); }
  });

  app.post("/api/demands/:id/attachments", ...guard, receiveAttachment, async (req: AuthRequest, res) => {
    try {
      if (!req.file) throw new DemandDomainError("Selecione um arquivo", "ATTACHMENT_INVALID", 400);
      res.status(201).json(await createDemandAttachment(req.accountId!, req.userId!, req.params.id, req.file));
    } catch (error) { sendError(res, error); }
  });

  app.get("/api/demands/:id/attachments/:attachmentId/download", ...guard, async (req: AuthRequest, res) => {
    try {
      const { attachment, absolutePath } = await getDemandAttachment(req.accountId!, req.params.id, req.params.attachmentId);
      res.type(attachment.mimeType).download(absolutePath, attachment.originalName);
    } catch (error) { sendError(res, error); }
  });

  app.delete("/api/demands/:id/attachments/:attachmentId", ...guard, async (req: AuthRequest, res) => {
    try {
      await deleteDemandAttachment(req.accountId!, req.userId!, req.params.id, req.params.attachmentId);
      res.status(204).end();
    } catch (error) { sendError(res, error); }
  });

  app.get("/api/demand-categories", ...guard, async (req: AuthRequest, res) => {
    try {
      const rows = await db.select().from(demandCategories).where(and(eq(demandCategories.accountId, req.accountId!), eq(demandCategories.active, true)));
      res.json(rows);
    } catch (error) { sendError(res, error); }
  });

  app.get("/api/demand-assignees", ...guard, async (req: AuthRequest, res) => {
    try {
      res.json(await db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(eq(users.accountId, req.accountId!)));
    } catch (error) { sendError(res, error); }
  });

  app.get("/api/demand-contacts", ...guard, async (req: AuthRequest, res) => {
    try {
      res.json(await db.select({ id: contacts.id, name: contacts.name, phone: contacts.phone, city: contacts.city }).from(contacts).where(eq(contacts.accountId, req.accountId!)));
    } catch (error) { sendError(res, error); }
  });

  app.post("/api/demand-categories", ...guard, async (req: AuthRequest, res) => {
    try {
      const input = insertDemandCategorySchema.parse(req.body);
      const [created] = await db.insert(demandCategories).values({ ...input, accountId: req.accountId! }).returning();
      res.status(201).json(created);
    } catch (error) { sendError(res, error); }
  });

  app.patch("/api/demand-categories/:id", ...guard, async (req: AuthRequest, res) => {
    try {
      const input = insertDemandCategorySchema.partial().parse(req.body);
      const [updated] = await db.update(demandCategories).set(input).where(and(eq(demandCategories.id, req.params.id), eq(demandCategories.accountId, req.accountId!))).returning();
      if (!updated) throw new DemandDomainError("Categoria nao encontrada", "CATEGORY_NOT_FOUND", 404);
      res.json(updated);
    } catch (error) { sendError(res, error); }
  });
}

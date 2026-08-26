import type { Express, RequestHandler, Response } from "express";
import { z } from "zod";
import { ContactMergeError, type createContactMergeService } from "../services/contact-merge";

type ContactMergeService = ReturnType<typeof createContactMergeService>;

const contactIdSchema = z.string().trim().min(1).max(255);
const selectionSchema = z.object({
  sourceContactIds: z.array(contactIdSchema).min(1).max(10),
  targetContactId: contactIdSchema,
}).strict();
const mergeSchema = selectionSchema.extend({
  previewToken: z.string().regex(/^[a-f0-9]{64}$/i),
  resolvedContact: z.record(z.unknown()),
}).strict();
const mergeIdSchema = z.string().trim().min(1).max(255);

const errorStatus: Record<string, number> = {
  CONTACT_MERGE_INVALID: 400,
  CONTACT_MERGE_STALE: 409,
  CONTACT_MERGE_CONFLICT: 409,
  CONTACT_MERGE_NOT_FOUND: 404,
  CONTACT_MERGE_REVERT_FORBIDDEN: 409,
};

function rejectInvalid(response: Response): Response {
  return response.status(400).json({ code: "CONTACT_MERGE_INVALID", error: "Dados da mesclagem invalidos" });
}

function handleError(response: Response, error: unknown): Response {
  if (error instanceof ContactMergeError) {
    return response.status(errorStatus[error.code] ?? 400).json({ code: error.code, error: error.message });
  }
  console.error("Erro na gestao de contatos duplicados:", error);
  return response.status(500).json({ code: "CONTACT_MERGE_FAILED", error: "Nao foi possivel processar a mesclagem" });
}

export function registerContactDuplicatesRoutes(app: Express, dependencies: {
  authenticate: RequestHandler;
  requireContacts: RequestHandler;
  service: ContactMergeService;
}): void {
  const secured = [dependencies.authenticate, dependencies.requireContacts] as const;

  app.get("/api/contacts/duplicates", ...secured, async (request: any, response) => {
    try {
      response.set("Cache-Control", "no-store");
      return response.json({ groups: await dependencies.service.duplicates(request.accountId) });
    } catch (error) {
      return handleError(response, error);
    }
  });

  app.post("/api/contacts/merge-preview", ...secured, async (request: any, response) => {
    const parsed = selectionSchema.safeParse(request.body);
    if (!parsed.success) return rejectInvalid(response);
    try {
      response.set("Cache-Control", "no-store");
      return response.json(await dependencies.service.preview({ accountId: request.accountId, ...parsed.data }));
    } catch (error) {
      return handleError(response, error);
    }
  });

  app.post("/api/contacts/merge", ...secured, async (request: any, response) => {
    const parsed = mergeSchema.safeParse(request.body);
    if (!parsed.success) return rejectInvalid(response);
    try {
      const events = await dependencies.service.merge({
        accountId: request.accountId,
        userId: request.userId,
        ...parsed.data,
        ipAddress: request.ip ?? null,
        userAgent: request.get("user-agent") ?? null,
      });
      response.set("Cache-Control", "no-store");
      return response.json({ events });
    } catch (error) {
      return handleError(response, error);
    }
  });

  app.get("/api/contacts/merges", ...secured, async (request: any, response) => {
    try {
      response.set("Cache-Control", "no-store");
      return response.json({ events: await dependencies.service.listMerges(request.accountId) });
    } catch (error) {
      return handleError(response, error);
    }
  });

  app.post("/api/contacts/merges/:id/revert", ...secured, async (request: any, response) => {
    const parsed = mergeIdSchema.safeParse(request.params.id);
    if (!parsed.success) return rejectInvalid(response);
    try {
      const event = await dependencies.service.revert({ accountId: request.accountId, userId: request.userId, mergeId: parsed.data });
      response.set("Cache-Control", "no-store");
      return response.json({ event });
    } catch (error) {
      return handleError(response, error);
    }
  });
}

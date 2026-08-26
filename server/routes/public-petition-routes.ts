import type { Express, NextFunction, Request, Response } from "express";
import { insertPetitionSignatureSchema } from "@shared/schema";
import { z } from "zod";
import { storage } from "../storage";
import { resolvePetitionSignatureContact } from "../services/petition-contact-link";
import {
  allowFixedWindowAttempt,
  filterPublishedPetitions,
  isPublicPetitionOpenForSignature,
  isPublicPetitionVisible,
  sanitizePublicPetition,
  validatePublicSignatureRequirements,
} from "../services/petitions";

const publicPetitionSignAttempts = new Map<string, { count: number; resetAt: number }>();
const PUBLIC_PETITION_SIGN_LIMIT = 20;
const PUBLIC_PETITION_SIGN_WINDOW_MS = 15 * 60 * 1000;

function getRequestIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.ip ||
    req.socket.remoteAddress ||
    "unknown";
}

function publicPetitionSignRateLimit(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  for (const [key, entry] of publicPetitionSignAttempts) {
    if (entry.resetAt <= now) publicPetitionSignAttempts.delete(key);
  }

  const key = `${getRequestIp(req)}:${req.params.slug || ""}`;
  const result = allowFixedWindowAttempt(
    publicPetitionSignAttempts,
    key,
    PUBLIC_PETITION_SIGN_LIMIT,
    PUBLIC_PETITION_SIGN_WINDOW_MS,
    now,
  );

  res.setHeader("X-RateLimit-Limit", String(PUBLIC_PETITION_SIGN_LIMIT));
  res.setHeader("X-RateLimit-Remaining", String(result.remaining));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));

  if (!result.allowed) {
    return res.status(429).json({ error: "Muitas tentativas de assinatura. Tente novamente em alguns minutos." });
  }

  next();
}

export function registerPublicPetitionRoutes(app: Express) {
  app.get("/api/public/petitions/:slug", async (req, res) => {
    try {
      const petition = await storage.getPetitionBySlug(req.params.slug);
      if (!isPublicPetitionVisible(petition)) {
        return res.status(404).json({ error: "Petição não encontrada" });
      }
      await storage.incrementPetitionViews(petition.id);
      const signaturesCount = await storage.getPetitionSignatureCount(petition.id);
      res.json(sanitizePublicPetition({ ...petition, signaturesCount }));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/public/petitions/:slug/count", async (req, res) => {
    try {
      const petition = await storage.getPetitionBySlug(req.params.slug);
      if (!isPublicPetitionVisible(petition)) return res.status(404).json({ error: "Petição não encontrada" });
      const signaturesCount = await storage.getPetitionSignatureCount(petition.id);
      res.json({ signaturesCount, goal: petition.goal });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/public/petitions/:slug/sign", publicPetitionSignRateLimit, async (req, res) => {
    try {
      const petition = await storage.getPetitionBySlug(req.params.slug);
      if (!isPublicPetitionVisible(petition)) {
        return res.status(404).json({ error: "Petição não encontrada" });
      }
      if (!isPublicPetitionOpenForSignature(petition)) {
        return res.status(400).json({ error: "Esta petição não está mais recebendo assinaturas." });
      }

      const requirementIssues = validatePublicSignatureRequirements(petition, req.body ?? {});
      if (requirementIssues.length > 0) {
        return res.status(400).json({
          error: "Campos obrigatórios não preenchidos",
          details: requirementIssues,
        });
      }

      const validated = insertPetitionSignatureSchema.omit({ petitionId: true }).parse(req.body);
      const email = validated.email && validated.email.trim() !== "" ? validated.email.trim().toLowerCase() : null;
      const cpf = validated.cpf && validated.cpf.replace(/\D/g, "") !== "" ? validated.cpf.replace(/\D/g, "") : null;

      if (email) {
        const existing = await storage.getPetitionSignatureByEmail(petition.id, email);
        if (existing) {
          return res.status(400).json({ error: "Este e-mail já assinou esta petição." });
        }
      }

      if (cpf) {
        const existingCpf = await storage.getPetitionSignatureByCpf(petition.id, cpf);
        if (existingCpf) {
          return res.status(400).json({ error: "Este CPF já assinou esta petição." });
        }
      }

      const contactId = await resolvePetitionSignatureContact({
        accountId: petition.accountId,
        userId: petition.userId,
        name: validated.name,
        email,
        phone: validated.phone,
        city: validated.city,
        state: validated.state,
      }, {
        findContact: (accountId, identity) => storage.findContactByIdentity(accountId, identity),
        createContact: (input) => storage.createContactFromPetition(input as any),
      });

      await storage.createPetitionSignature({
        ...validated,
        email,
        cpf,
        contactId,
        petitionId: petition.id,
        ipAddress: getRequestIp(req),
      });
      const signaturesCount = await storage.getPetitionSignatureCount(petition.id);
      res.status(201).json({ success: true, signaturesCount });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Dados inválidos", details: error.errors });
      }
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/public/linkbio/:slug", async (req, res) => {
    try {
      const page = await storage.getLinkBioPageBySlug(req.params.slug);
      if (!page || page.status !== "publicada") {
        return res.status(404).json({ error: "Página não encontrada" });
      }
      await storage.incrementLinkBioViews(page.id);
      const ids = page.petitionIds || [];
      const petitionsData = await Promise.all(ids.map(async (pid) => {
        const petition = await storage.getPetition(pid, page.accountId);
        if (!petition) return null;
        const signaturesCount = await storage.getPetitionSignatureCount(petition.id);
        return { ...petition, signaturesCount };
      }));
      const publicPetitions = filterPublishedPetitions(petitionsData.filter(Boolean) as Record<string, any>[])
        .map(sanitizePublicPetition);
      const {
        accountId: _accountId,
        userId: _userId,
        petitionIds: _petitionIds,
        viewsCount: _viewsCount,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        ...publicPage
      } = page as any;
      res.json({ ...publicPage, petitions: publicPetitions });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/public/linktree/:slug", async (req, res) => {
    try {
      const page = await storage.getLinkTreePageBySlug(req.params.slug);
      if (!page || page.status !== "publicada") {
        return res.status(404).json({ error: "Página não encontrada" });
      }
      await storage.incrementLinkTreeViews(page.id);
      const {
        accountId: _accountId,
        userId: _userId,
        viewsCount: _viewsCount,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        ...publicPage
      } = page as any;
      res.json(publicPage);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}

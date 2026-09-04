import type { RequestHandler } from "express";
import { isPublicPetitionVisible } from "./services/petitions";
import {
  buildGenericPetitionPreview,
  buildPetitionPreview,
  injectPetitionPreviewHtml,
  isSocialCrawler,
  resolvePetitionTemplatePath,
  resolvePublicOrigin,
  type PetitionPreviewSource,
} from "./petition-link-preview";

type PetitionPreviewRecord = PetitionPreviewSource & {
  id: string;
  status?: string | null;
};

export type PetitionLinkPreviewDependencies = {
  getPetitionBySlug: (slug: string) => Promise<PetitionPreviewRecord | undefined>;
  getPetitionSignatureCount: (petitionId: string) => Promise<number>;
  readFile: (filePath: string, encoding: "utf-8") => Promise<string>;
  environment?: string;
  runtimeDirectory: string;
  publicAppUrl?: string;
  log: (message: string) => void;
};

export function createPetitionLinkPreviewHandler(
  dependencies: PetitionLinkPreviewDependencies,
): RequestHandler {
  return async (req, res, next) => {
    if (!isSocialCrawler(req.get("user-agent") ?? "")) return next();

    try {
      const slug = req.params.slug;
      const petition = await dependencies.getPetitionBySlug(slug);
      const origin = resolvePublicOrigin(req.headers, dependencies.publicAppUrl);
      const preview = isPublicPetitionVisible(petition)
        ? buildPetitionPreview(
            petition,
            await dependencies.getPetitionSignatureCount(petition.id),
            origin,
          )
        : buildGenericPetitionPreview(origin, slug);
      const templatePath = resolvePetitionTemplatePath(
        dependencies.environment,
        dependencies.runtimeDirectory,
      );
      const template = await dependencies.readFile(templatePath, "utf-8");
      const requestedVersion = typeof req.query.v === "string" ? req.query.v.trim() : "";
      const socialUrl = /^[a-z0-9_-]{1,64}$/i.test(requestedVersion)
        ? `${preview.url}?v=${encodeURIComponent(requestedVersion)}`
        : preview.url;

      res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      res.type("html");
      return res.send(injectPetitionPreviewHtml(template, preview, socialUrl));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dependencies.log(`Petition preview error: ${message}`);
      return next();
    }
  };
}

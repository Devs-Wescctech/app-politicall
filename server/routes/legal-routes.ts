import type { Express } from "express";
import {
  renderPrivacyPage,
  renderSocialPrivacyPage,
  renderTermsPage,
} from "../services/legal-pages";

export function registerLegalRoutes(app: Express) {
  app.get("/privacy", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(renderPrivacyPage());
  });

  app.get("/terms", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(renderTermsPage());
  });

  app.get("/privacy/facebook/:accountSlug", (req, res) => {
    res.type("text/html").send(renderSocialPrivacyPage("facebook", req.params.accountSlug));
  });

  app.get("/privacy/instagram/:accountSlug", (req, res) => {
    res.type("text/html").send(renderSocialPrivacyPage("instagram", req.params.accountSlug));
  });

  app.get("/privacy/twitter/:accountSlug", (req, res) => {
    res.type("text/html").send(renderSocialPrivacyPage("twitter", req.params.accountSlug));
  });
}

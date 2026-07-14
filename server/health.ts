import type { Express } from "express";

interface HealthDependencies {
  checkDatabase: () => Promise<void>;
}

export function registerHealthRoutes(app: Express, dependencies: HealthDependencies): void {
  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/api/ready", async (_req, res) => {
    try {
      await dependencies.checkDatabase();
      res.status(200).json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });
}

import type { Express } from "express";

interface HealthDependencies {
  checkDatabase: () => Promise<void>;
  isShuttingDown?: () => boolean;
}

export function registerHealthRoutes(app: Express, dependencies: HealthDependencies): void {
  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/api/ready", async (_req, res) => {
    if (dependencies.isShuttingDown?.()) {
      res.status(503).json({ status: "unavailable" });
      return;
    }

    try {
      await dependencies.checkDatabase();
      res.status(200).json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });
}

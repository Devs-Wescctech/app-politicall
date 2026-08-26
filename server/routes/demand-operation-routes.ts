import type { Express, RequestHandler } from "express";
import { authenticateToken, requirePermission, type AuthRequest } from "../auth";
import {
  DemandOperationsInputError,
  getDemandOperations,
  normalizeDemandOperationFilters,
} from "../services/demand-operations";

type Dependencies = {
  authenticate?: RequestHandler;
  requireDemands?: RequestHandler;
  getOperations?: typeof getDemandOperations;
  now?: () => Date;
};

export function registerDemandOperationRoutes(app: Express, dependencies: Dependencies = {}) {
  const authenticate = dependencies.authenticate ?? authenticateToken;
  const requireDemands = dependencies.requireDemands ?? requirePermission("demands");
  const getOperations = dependencies.getOperations ?? getDemandOperations;
  const now = dependencies.now ?? (() => new Date());

  app.get("/api/demand-operations", authenticate, requireDemands, async (req: AuthRequest, res) => {
    try {
      const filters = normalizeDemandOperationFilters(req.query as Record<string, unknown>, now());
      res.json(await getOperations(req.accountId!, filters));
    } catch (error) {
      if (error instanceof DemandOperationsInputError) {
        return res.status(400).json({ error: error.message, code: "VALIDATION_ERROR" });
      }
      console.error("Demand operations route failed:", error);
      return res.status(500).json({
        error: "Nao foi possivel carregar a central de demandas",
        code: "DEMAND_OPERATIONS_INTERNAL_ERROR",
      });
    }
  });
}

import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const projectFile = (relativePath: string) => readFile(path.join(root, relativePath), "utf8");

describe("production migration rollout package", () => {
  it("keeps the production preflight strictly read-only and fail-closed", async () => {
    const preflight = await projectFile("scripts/preflight-production-migrations-0011-0025.sql");

    expect(preflight).toContain("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(preflight).toContain("\\set ON_ERROR_STOP on");
    expect(preflight).toContain("preflight_passed");
    expect(preflight).toContain("ROLLBACK;");
    expect(preflight).not.toMatch(/^\s*(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE|CALL|DO)\b/im);
  });

  it("documents explicit backup, approval, health, idempotency, and paired restore gates", async () => {
    const runbook = await projectFile("docs/deployment/migrations-0011-0025-rollout.md");

    for (const requirement of [
      "aprovação explícita",
      "PGSERVICE",
      "PGPASSFILE",
      "applied_count=15",
      "applied_count=0",
      "skipped_count=24",
      "/api/ready",
      "/api/health",
      "101 Switching Protocols",
      "restaurar o banco, uploads e imagem anterior",
    ]) {
      expect(runbook).toContain(requirement);
    }
    expect(runbook).toContain("não executa DDL/DML");
    expect(runbook).not.toMatch(/postgres(?:ql)?:\/\/[^<\s/:@]+:[^<\s/@]+@/i);
  });
});

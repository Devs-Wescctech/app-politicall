import { describe, expect, it } from "vitest";
import {
  assertDevelopmentSeedTarget,
  DEVELOPMENT_SEED_CONFIRMATION,
} from "../scripts/development-database-safety";

const localDatabaseUrl = "postgresql://username:password@127.0.0.1:5432/politicall_test";

describe("development database seed safety", () => {
  it("requires an explicit confirmation before mutating the database", () => {
    expect(() => assertDevelopmentSeedTarget({
      databaseUrl: localDatabaseUrl,
    })).toThrow(/ALLOW_DEVELOPMENT_SEED/);
  });

  it("refuses to run when NODE_ENV is production", () => {
    expect(() => assertDevelopmentSeedTarget({
      databaseUrl: localDatabaseUrl,
      confirmation: DEVELOPMENT_SEED_CONFIRMATION,
      nodeEnv: "production",
    })).toThrow(/NODE_ENV=production/);
  });

  it("refuses to run against the configured production database", () => {
    expect(() => assertDevelopmentSeedTarget({
      databaseUrl: localDatabaseUrl,
      productionDatabaseUrl: localDatabaseUrl,
      confirmation: DEVELOPMENT_SEED_CONFIRMATION,
    })).toThrow(/PROD_DATABASE_URL/);
  });

  it("allows an explicitly confirmed non-production database", () => {
    expect(() => assertDevelopmentSeedTarget({
      databaseUrl: localDatabaseUrl,
      productionDatabaseUrl: "postgresql://username:password@production.example:5432/politicall",
      confirmation: DEVELOPMENT_SEED_CONFIRMATION,
      nodeEnv: "development",
    })).not.toThrow();
  });
});

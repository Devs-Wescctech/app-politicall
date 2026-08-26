export const DEVELOPMENT_SEED_CONFIRMATION = "seed-development-data";

type DevelopmentSeedTarget = {
  databaseUrl: string;
  productionDatabaseUrl?: string;
  confirmation?: string;
  nodeEnv?: string;
};

function normalizeDatabaseUrl(value: string) {
  const url = new URL(value);
  url.username = decodeURIComponent(url.username);
  url.password = decodeURIComponent(url.password);
  return url.toString();
}

export function assertDevelopmentSeedTarget(target: DevelopmentSeedTarget) {
  if (target.confirmation !== DEVELOPMENT_SEED_CONFIRMATION) {
    throw new Error(
      `ALLOW_DEVELOPMENT_SEED must equal ${DEVELOPMENT_SEED_CONFIRMATION} before development seed data can be written.`,
    );
  }

  if (target.nodeEnv?.trim().toLowerCase() === "production") {
    throw new Error("Development seed is disabled when NODE_ENV=production.");
  }

  if (
    target.productionDatabaseUrl
    && normalizeDatabaseUrl(target.databaseUrl) === normalizeDatabaseUrl(target.productionDatabaseUrl)
  ) {
    throw new Error("DATABASE_URL must not match PROD_DATABASE_URL when running the development seed.");
  }
}

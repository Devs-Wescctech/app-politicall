import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectFile = (name: string) => readFile(path.join(process.cwd(), name), "utf8");

describe("local Docker development configuration", () => {
  it("runs the application against an isolated healthy PostgreSQL service", async () => {
    const compose = await projectFile("docker-compose.local.yml");

    expect(compose).toContain("image: postgres:16-alpine");
    expect(compose).toContain("DATABASE_URL: postgresql://username:password@db:5432/database_name");
    expect(compose).toContain("ALLOW_DEVELOPMENT_SEED: seed-development-data");
    expect(compose).toContain("condition: service_healthy");
    expect(compose).toContain("127.0.0.1:${APP_PORT:-5000}:5000");
    expect(compose).not.toContain("PROD_DATABASE_URL");
  });

  it("installs the database client required by the automatic dev bootstrap", async () => {
    const dockerfile = await projectFile("Dockerfile.local");

    expect(dockerfile).toContain("FROM node:24.18.0-trixie-slim");
    expect(dockerfile).toContain("postgresql-client");
    expect(dockerfile).toContain('["npm", "run", "dev"]');
  });

  it("documents startup, test credentials, and safe reset separately from production", async () => {
    const guide = await projectFile("README.local.md");

    expect(guide).toContain("docker-compose.local.yml up --build");
    expect(guide).toContain("adm@politicall.com.br");
    expect(guide).toContain("docker-compose.local.yml down -v");
    expect(guide).toContain("apaga somente os volumes do projeto local");
  });
});

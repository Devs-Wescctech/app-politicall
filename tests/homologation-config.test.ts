import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const projectFile = (relativePath: string) => readFile(path.join(root, relativePath), "utf8");

describe("isolated production-parity homologation", () => {
  it("uses a production build with PostgreSQL 18.1 and isolated resources", async () => {
    const [compose, dockerfile] = await Promise.all([
      projectFile("docker-compose.homolog.yml"),
      projectFile("Dockerfile"),
    ]);

    expect(compose).toContain("name: politicall-homolog");
    expect(compose).toContain("image: postgres:18.1-alpine");
    expect(compose).toContain("dockerfile: Dockerfile");
    expect(compose).toContain("NODE_ENV: production");
    expect(compose).toContain("PROD_DATABASE_URL: ${HOMOLOG_DATABASE_URL:?required}");
    expect(compose).toContain("127.0.0.1:${HOMOLOG_APP_PORT:-5100}:5000");
    expect(compose).toContain("politicall_homolog_postgres_data:");
    expect(compose).toContain("politicall_homolog_uploads:");
    expect(compose).toContain("homolog_frontend:");
    expect(compose).toMatch(/homolog_backend:\s+internal: true/);
    expect(compose).not.toMatch(/PROD_DATABASE_URL:\s*[^\n]*172\.27\.34\.100/);
    expect(dockerfile).toContain("node dist/migrate-production.js && exec node dist/index.js");
  });

  it("seeds only fictitious test data after the application is healthy", async () => {
    const [compose, seed] = await Promise.all([
      projectFile("docker-compose.homolog.yml"),
      projectFile("scripts/homolog_seed.sql"),
    ]);

    expect(compose).toContain("condition: service_healthy");
    expect(compose).toContain("psql --set=ON_ERROR_STOP=1");
    expect(seed).toContain("Gabinete Politicall Homologação");
    expect(seed).toContain("adm.homolog@politicall.local");
    expect(seed).toContain("ON CONFLICT");
    expect(seed).not.toMatch(/@(?:gmail|hotmail|outlook)\./i);
  });

  it("keeps every landing-page asset import buildable", async () => {
    const landing = await projectFile("client/src/pages/landing.tsx");
    const assets = [...landing.matchAll(/from "@assets\/(.+?)"/g)].map((match) => match[1]);

    expect(assets.length).toBeGreaterThan(0);
    await Promise.all(assets.map((asset) => access(path.join(root, "attached_assets", asset))));
  });
});

import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const readProjectFile = (name: string) => readFile(path.join(root, name), "utf8");

describe("deployment configuration", () => {
  it("injects production secrets instead of committing them", async () => {
    const compose = await readProjectFile("docker-compose.yml");

    expect(compose).toMatch(/PROD_DATABASE_URL:\s*["']?\$\{PROD_DATABASE_URL:\?required\}["']?/);
    expect(compose).toMatch(/SESSION_SECRET:\s*["']?\$\{SESSION_SECRET:\?required\}["']?/);
    expect(compose).not.toMatch(/postgres(?:ql)?:\/\/[^$\s]+/i);
    expect(compose).not.toMatch(/SESSION_SECRET=[A-Za-z0-9+/]{24,}={0,2}/);
  });

  it("copies the restored attached_assets directory into the runtime image", async () => {
    const dockerfile = await readProjectFile("Dockerfile");

    expect(dockerfile).toContain("/app/attached_assets ./attached_assets");
  });

  it("does not reference the missing legacy survey background", async () => {
    const page = await readProjectFile("client/src/pages/survey-landing.tsx");

    expect(page).not.toContain("/attached_assets/242%20(1)_1763481516412.jpg");
    expect(page).toContain("backgroundImage: `url(${surveyBackground})`");
  });

  it("keeps local credentials and environment files out of source control", async () => {
    const gitignore = await readProjectFile(".gitignore");

    expect(gitignore).toMatch(/^\.env$/m);
    expect(gitignore).toMatch(/^\.env\.\*$/m);
    expect(gitignore).toMatch(/^\.admin-config\.json$/m);
  });

  it("contains no references to the private Replit package registry", async () => {
    const lockfile = await readProjectFile("package-lock.json");

    expect(lockfile).not.toContain("package-firewall.replit.local");
  });

  it("stops database bootstrap on the first SQL error", async () => {
    const setup = await readProjectFile("scripts/setup-dev-db.ts");
    const schema = await readProjectFile("scripts/full_schema.sql");

    expect(setup).toContain('"-v ON_ERROR_STOP=1"');
    expect(setup.indexOf('`-f ${file}`')).toBeLessThan(
      setup.indexOf("parsed.pathname.slice(1)"),
    );
    expect(schema).not.toMatch(/^\\unrestrict\b/m);
  });

  it("applies the campaign center migration during database bootstrap", async () => {
    const setup = await readProjectFile("scripts/setup-dev-db.ts");
    const migration = await readProjectFile("migrations/0006_campaign_center.sql");

    expect(setup).toContain('applyMigration("migrations/0006_campaign_center.sql")');
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS channels text[]");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS campaign_recipients");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS message_templates");
  });

  it("applies the contact neighborhood migration during database bootstrap", async () => {
    const setup = await readProjectFile("scripts/setup-dev-db.ts");
    const migration = await readProjectFile("migrations/0007_contact_neighborhood.sql");

    expect(setup).toContain('applyMigration("migrations/0007_contact_neighborhood.sql")');
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS neighborhood text");
  });

  it("applies the attendance external-message-id migration during database bootstrap", async () => {
    const setup = await readProjectFile("scripts/setup-dev-db.ts");
    const migration = await readProjectFile("migrations/0008_att_messages_external_id_unique.sql");

    expect(setup).toContain('applyMigration("migrations/0008_att_messages_external_id_unique.sql")');
    expect(migration).toContain("att_messages");
    expect(migration).toContain("external_message_id");
  });

  it("applies the PetiçõesBR module migration during database bootstrap", async () => {
    const setup = await readProjectFile("scripts/setup-dev-db.ts");
    const migration = await readProjectFile("migrations/0009_petitionsbr_module.sql");

    expect(setup).toContain('applyMigration("migrations/0009_petitionsbr_module.sql")');
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS petitions");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS petition_signatures");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS petition_campaigns");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS petition_campaign_logs");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS petition_message_templates");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS linkbio_pages");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS linktree_pages");
    expect(migration).toContain("CREATE INDEX IF NOT EXISTS petitions_account_status_idx");
  });

  it("runs automated tests and blocks high severity dependency audit failures in CI", async () => {
    const workflow = await readProjectFile(".github/workflows/build.yml");
    const auditStep = workflow.match(/- name: Run security audit[\s\S]*?(?=\n\s*- name:|\n\s*# Job|\n\s*[a-z-]+:\n)/)?.[0] ?? "";

    expect(workflow).toContain("run: npm test");
    expect(workflow).toContain("run: npm audit --omit=dev --audit-level=high");
    expect(auditStep).not.toContain("continue-on-error: true");
  });
});

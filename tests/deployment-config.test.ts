import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const execFileAsync = promisify(execFile);
const readProjectFile = (name: string) => readFile(path.join(root, name), "utf8");

type YamlMap = Record<string, unknown>;

function parseYamlMap(source: string): YamlMap {
  const lines = source
    .split(/\r?\n/)
    .map((line) => ({ indent: line.match(/^\s*/)?.[0].length ?? 0, content: line.trim() }))
    .filter(({ content }) => content.length > 0 && !content.startsWith("#"));
  const root: YamlMap = {};
  const stack: Array<{ indent: number; value: YamlMap | string[] }> = [{ indent: -1, value: root }];

  for (let index = 0; index < lines.length; index += 1) {
    const { indent, content } = lines[index];
    while (stack.at(-1)!.indent >= indent) stack.pop();

    const parent = stack.at(-1)!.value;
    if (content.startsWith("- ")) {
      if (!Array.isArray(parent)) throw new Error(`Unexpected YAML list item: ${content}`);
      parent.push(content.slice(2).replace(/^(?:["'])|(?:["'])$/g, ""));
      continue;
    }

    const match = content.match(/^([^:#][^:]*):(?:\s+(.*))?$/);
    if (!match || Array.isArray(parent)) throw new Error(`Unsupported YAML line: ${content}`);

    const [, key, rawValue = ""] = match;
    if (rawValue.length > 0) {
      parent[key] = rawValue.replace(/^(?:["'])|(?:["'])$/g, "");
      continue;
    }

    const next = lines[index + 1];
    const value: YamlMap | string[] = next?.indent > indent && next.content.startsWith("- ") ? [] : {};
    parent[key] = value;
    stack.push({ indent, value });
  }

  return root;
}

function asYamlMap(value: unknown, name: string): YamlMap {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`Expected ${name} to be a YAML map`);
  }
  return value as YamlMap;
}

function parseEnvExample(source: string): Record<string, string> {
  return Object.fromEntries(
    source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        if (separator < 1) throw new Error(`Invalid environment entry: ${line}`);
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

describe("deployment configuration", () => {
  it("injects production secrets instead of committing them", async () => {
    const compose = await readProjectFile("docker-compose.yml");

    expect(compose).toMatch(/PROD_DATABASE_URL:\s*["']?\$\{PROD_DATABASE_URL:\?required\}["']?/);
    expect(compose).toMatch(/SESSION_SECRET:\s*["']?\$\{SESSION_SECRET:\?required\}["']?/);
    expect(compose).not.toMatch(/postgres(?:ql)?:\/\/[^$\s]+/i);
    expect(compose).not.toMatch(/SESSION_SECRET=[A-Za-z0-9+/]{24,}={0,2}/);
  });

  it("defines an immutable, localhost-only Portainer application contract", async () => {
    const compose = parseYamlMap(await readProjectFile("docker-compose.yml"));
    const services = asYamlMap(compose.services, "services");
    const app = asYamlMap(services.app, "services.app");
    const environment = asYamlMap(app.environment, "services.app.environment");
    const healthcheck = asYamlMap(app.healthcheck, "services.app.healthcheck");
    const logging = asYamlMap(app.logging, "services.app.logging");
    const loggingOptions = asYamlMap(logging.options, "services.app.logging.options");
    const ulimits = asYamlMap(app.ulimits, "services.app.ulimits");
    const nofile = asYamlMap(ulimits.nofile, "services.app.ulimits.nofile");

    expect(Object.keys(services)).toEqual(["app"]);
    expect(app.image).toBe("${IMAGE_REPOSITORY:?required}:${IMAGE_TAG:?required}");
    expect(app.restart).toBe("unless-stopped");
    expect(app.stop_grace_period).toBe("30s");
    expect(app.ports).toEqual(["127.0.0.1:${APP_PORT:-5000}:5000"]);
    expect(app.volumes).toEqual(["${UPLOADS_HOST_PATH:?required}:/app/uploads"]);
    expect(environment).toMatchObject({
      NODE_ENV: "production",
      PORT: "5000",
      PROD_DATABASE_URL: "${PROD_DATABASE_URL:?required}",
      SESSION_SECRET: "${SESSION_SECRET:?required}",
      DATA_ENCRYPTION_KEY: "${DATA_ENCRYPTION_KEY:?required}",
      ADMIN_MASTER_PASSWORD_HASH: "${ADMIN_MASTER_PASSWORD_HASH:?required}",
      TRUST_PROXY: "${TRUST_PROXY:-1}",
    });
    expect(healthcheck.test).toContain("/api/ready");
    expect(String(healthcheck.test)).not.toContain("/api/health");
    expect(healthcheck).toMatchObject({ interval: "30s", timeout: "10s", retries: "5", start_period: "90s" });
    expect(logging.driver).toBe("json-file");
    expect(loggingOptions).toMatchObject({ "max-size": "10m", "max-file": "5" });
    expect(app.security_opt).toEqual(["no-new-privileges:true"]);
    expect(app).toMatchObject({ mem_limit: "1g", memswap_limit: "2g", pids_limit: "256", shm_size: "256mb" });
    expect(nofile).toMatchObject({ soft: "65536", hard: "65536" });
  });

  it("keeps the Compose contract free of public binds, mutable tags, and literal credentials", async () => {
    const compose = await readProjectFile("docker-compose.yml");
    const activeCompose = compose
      .split(/\r?\n/)
      .filter((line) => !line.trimStart().startsWith("#"))
      .join("\n");

    expect(activeCompose).not.toMatch(/(^|[^\w-])latest(?:$|[^\w-])/im);
    expect(activeCompose).not.toMatch(/postgres(?:ql)?:\/\/[^\s"']+:[^\s"']+@/i);
    expect(activeCompose).not.toMatch(/^\s*-\s*["']?(?:0\.0\.0\.0:)?\$?\{?APP_PORT/im);
  });

  it("documents only safe Portainer environment placeholders", async () => {
    const exampleSource = await readProjectFile(".env.example");
    const environment = parseEnvExample(exampleSource);

    expect(environment).toMatchObject({
      IMAGE_REPOSITORY: "ghcr.io/example-org/politicall",
      IMAGE_TAG: "sha-0123456789abcdef",
      APP_PORT: "5000",
      UPLOADS_HOST_PATH: "<absolute-host-path-to-persistent-uploads>",
      PROD_DATABASE_URL: "<postgresql-connection-string>",
      SESSION_SECRET: "<generate-with-openssl-rand-base64-48>",
      DATA_ENCRYPTION_KEY: "<generate-32-byte-key-base64>",
      ADMIN_MASTER_PASSWORD_HASH: "<generate-with-bcrypt>",
      TRUST_PROXY: "1",
      OKTOR_SMS_ENDPOINT: "<optional-n8n-webhook-url>",
      OKTOR_SMS_ACCOUNT: "",
      OKTOR_SMS_CODE: "",
      OKTOR_SMS_CLIENT: "",
      OKTOR_SMS_TIPO_ENVIO: "7",
    });
    expect(exampleSource).not.toMatch(/postgres(?:ql)?:\/\/[^\s"']+:[^\s"']+@/i);
    expect(exampleSource).not.toMatch(/(^|[^\w-])latest(?:$|[^\w-])/im);
  });

  it("ships Portainer, backup, and websocket proxy runbooks", async () => {
    const [portainer, nginx, backup] = await Promise.all([
      readProjectFile("docs/deployment/portainer-production.md"),
      readProjectFile("docs/deployment/nginx-websocket.conf"),
      readProjectFile("docs/deployment/backup-restore.md"),
    ]);

    expect(portainer).toContain("GHCR");
    expect(portainer).toContain("digest");
    expect(portainer).toContain("/api/ready");
    expect(portainer).toContain("/api/health");
    expect(portainer).toContain("/api/attendance/realtime");
    expect(nginx).toContain("location = /api/attendance/realtime");
    expect(nginx).toContain("proxy_set_header Upgrade $http_upgrade");
    expect(nginx).toContain("proxy_set_header Connection $connection_upgrade");
    expect(backup).toContain("pg_dump");
    expect(backup).toContain("isolado");
  });

  it("copies the restored attached_assets directory into the runtime image", async () => {
    const dockerfile = await readProjectFile("Dockerfile");

    expect(dockerfile).toContain("/app/attached_assets ./attached_assets");
  });

  it("builds a minimal Node 24 production image", async () => {
    const dockerfile = await readProjectFile("Dockerfile");
    const productionStage = dockerfile.split("FROM node:24.18.0-bookworm-slim AS production")[1];

    expect(dockerfile).toMatch(/^FROM node:24\.18\.0-bookworm-slim AS builder$/m);
    expect(productionStage).toBeDefined();
    expect(productionStage).toContain("apt-get install -y --no-install-recommends wget tini");
    expect(productionStage).toContain("RUN npm ci --omit=dev");
    expect(productionStage).toContain("groupadd --gid 1001 nodejs");
    expect(productionStage).toContain("useradd --uid 1001 --gid nodejs");
    expect(productionStage).toContain("uploads/avatars uploads/backgrounds uploads/petitions uploads/temp");
    expect(productionStage).toContain("chown -R 1001:1001 /app/attached_assets /app/uploads");
    expect(productionStage).toContain('ENTRYPOINT ["/usr/bin/tini", "--"]');
    expect(productionStage).toContain('COPY --from=builder --chown=1001:1001 /app/migrations ./migrations');
    expect(productionStage).toContain('COPY --from=builder --chown=1001:1001 /app/scripts/full_schema.sql ./scripts/full_schema.sql');
    expect(productionStage).toContain('CMD ["sh", "-c", "node dist/migrate-production.js && exec node dist/index.js"]');

    for (const sourceOnlyPath of ["./client", "./vite.config.ts", "./shared", "./tsconfig.json", "./drizzle.config.ts"]) {
      expect(productionStage).not.toContain(sourceOnlyPath);
    }
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

  it("excludes local knowledge, runtime state, uploads, and backups from Git", async () => {
    const ignore = await readProjectFile(".gitignore");

    for (const pattern of ["/Obsidian Vault/", "/graphify-out/", "/.runtime/", "/backups/", "/uploads/*", "/.superpowers/"]) {
      expect(ignore).toContain(pattern);
    }
    expect(ignore).toContain("!/uploads/.gitkeep");
  });

  it("keeps only the upload marker in the Git index", async () => {
    const { stdout } = await execFileAsync("git", ["ls-files", "--", "uploads"], { cwd: root });

    expect(stdout.split(/\r?\n/).filter(Boolean)).toEqual(["uploads/.gitkeep"]);
  });

  it("excludes private local artifacts from the Docker build context", async () => {
    const ignore = await readProjectFile(".dockerignore");

    for (const pattern of [".runtime/", "backups/", "Obsidian Vault/", "graphify-out/", ".superpowers/", "*.zip"]) {
      expect(ignore).toContain(pattern);
    }
  });

  it("contains no references to the private Replit package registry", async () => {
    const lockfile = await readProjectFile("package-lock.json");

    expect(lockfile).not.toContain("package-firewall.replit.local");
  });

  it("keeps runtime and build dependencies in their correct install groups", async () => {
    const packageJson = JSON.parse(await readProjectFile("package.json"));

    expect(packageJson.engines.node).toBe(">=24 <25");
    expect(packageJson.dependencies).toMatchObject({
      archiver: "^8.0.0",
      exceljs: "^4.4.0",
      googleapis: "^173.0.0",
    });
    for (const packageName of [
      "@types/archiver",
      "@types/bcrypt",
      "@types/jsonwebtoken",
      "@types/multer",
      "@types/pdfkit",
      "@types/pdfmake",
      "@types/qrcode",
      "@types/qrcode.react",
      "tailwindcss-animate",
      "vitest",
    ]) {
      expect(packageJson.devDependencies).toHaveProperty(packageName);
      expect(packageJson.dependencies).not.toHaveProperty(packageName);
    }
  });

  it("builds the locked production migration CLI alongside the application", async () => {
    const packageJson = JSON.parse(await readProjectFile("package.json"));

    expect(packageJson.scripts.build).toContain("server/index.ts");
    expect(packageJson.scripts.build).toContain("scripts/migrate-production.ts");
    expect(packageJson.scripts.build).toContain("--outfile=dist/index.js");
    expect(packageJson.scripts.build).toContain("--outfile=dist/migrate-production.js");
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

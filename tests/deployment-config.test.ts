import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const execFileAsync = promisify(execFile);
const readProjectFile = (name: string) => readFile(path.join(root, name), "utf8");
const syntheticFullCommitSha = "0123456789abcdef0123456789abcdef01234567";
const syntheticShaTagReference = `ghcr.io/example-org/politicall:sha-${syntheticFullCommitSha}`;
const syntheticDigestReference = `ghcr.io/example-org/politicall@sha256:${"0".repeat(64)}`;
const immutableImageReference = /^ghcr\.io\/[a-z0-9._-]+\/[a-z0-9._-]+(?::sha-[0-9a-f]{7,64}|@sha256:[0-9a-f]{64})$/;

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

function renderComposeTemplate(source: string, variables: Record<string, string>): string {
  return source.replace(/\$\{([A-Z][A-Z0-9_]*):([?-])([^}]*)\}/g, (_match, name, operator, fallback) => {
    const value = variables[name];
    if (operator === "?" && !value) throw new Error(`Missing required Compose variable: ${name}`);
    return value || fallback;
  });
}

function syntheticComposeEnvironment(imageReference: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    IMAGE_REFERENCE: imageReference,
    APP_PORT: "5000",
    PUBLIC_APP_URL: "https://politicall.example",
    ENABLE_BEARER_EXCHANGE: "false",
    ENABLE_BEARER_AUTH: "false",
    APP_NETWORK_NAME: "politicall-production-test",
    UPLOADS_HOST_PATH: "/srv/politicall-test/uploads",
    PROD_DATABASE_URL: "postgresql://database.invalid/politicall",
    SESSION_SECRET: "synthetic-session-secret-not-for-use",
    DATA_ENCRYPTION_KEY: "synthetic-encryption-key-not-for-use",
    ADMIN_MASTER_PASSWORD_HASH: "synthetic-bcrypt-hash-not-for-use",
    TRUST_PROXY: "1",
  };
}

async function hasStandaloneDockerCompose(): Promise<boolean> {
  try {
    await execFileAsync("docker-compose", ["version"], { cwd: root });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function markdownSection(source: string, heading: string): string {
  const marker = `## ${heading}`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing Markdown section: ${heading}`);
  const end = source.indexOf("\n## ", start + marker.length);
  return source.slice(start, end < 0 ? source.length : end);
}

function expectTextInOrder(source: string, fragments: string[]): void {
  let cursor = -1;
  for (const fragment of fragments) {
    const next = source.indexOf(fragment, cursor + 1);
    expect(next, `Expected "${fragment}" after offset ${cursor}`).toBeGreaterThan(cursor);
    cursor = next;
  }
}

function workflowJob(source: string, name: string): string {
  const match = source.match(new RegExp(`^  ${name}:\\s*$([\\s\\S]*?)(?=^  [a-z][a-z0-9-]*:\\s*$|(?![\\s\\S]))`, "m"));
  if (!match) throw new Error(`Missing workflow job: ${name}`);
  return match[0];
}

function workflowStep(source: string, name: string): string {
  const match = source.match(new RegExp(`^      - name: ${name}\\s*$([\\s\\S]*?)(?=^      - name:|(?![\\s\\S]))`, "m"));
  if (!match) throw new Error(`Missing workflow step: ${name}`);
  return match[0];
}

function actionReferences(source: string): string[] {
  return [...source.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gm)].map((match) => match[1]);
}

describe("deployment configuration", () => {
  it("injects production secrets instead of committing them", async () => {
    const compose = await readProjectFile("docker-compose.yml");

    expect(compose).toMatch(/PROD_DATABASE_URL:\s*["']?\$\{PROD_DATABASE_URL:\?required\}["']?/);
    expect(compose).toMatch(/SESSION_SECRET:\s*["']?\$\{SESSION_SECRET:\?required\}["']?/);
    expect(compose).not.toMatch(/postgres(?:ql)?:\/\/[^$\s]+/i);
    expect(compose).not.toMatch(/SESSION_SECRET=[A-Za-z0-9+/]{24,}={0,2}/);
  });

  it("defines a complete-image-reference, localhost-only Portainer application contract", async () => {
    const compose = parseYamlMap(await readProjectFile("docker-compose.yml"));
    const services = asYamlMap(compose.services, "services");
    const app = asYamlMap(services.app, "services.app");
    const environment = asYamlMap(app.environment, "services.app.environment");
    const healthcheck = asYamlMap(app.healthcheck, "services.app.healthcheck");
    const logging = asYamlMap(app.logging, "services.app.logging");
    const loggingOptions = asYamlMap(logging.options, "services.app.logging.options");
    const ulimits = asYamlMap(app.ulimits, "services.app.ulimits");
    const nofile = asYamlMap(ulimits.nofile, "services.app.ulimits.nofile");
    const networks = asYamlMap(compose.networks, "networks");
    const productionNetwork = asYamlMap(networks.production, "networks.production");

    expect(Object.keys(services)).toEqual(["app"]);
    expect(app.image).toBe("${IMAGE_REFERENCE:?required}");
    expect(app.restart).toBe("unless-stopped");
    expect(app.stop_grace_period).toBe("30s");
    expect(app.ports).toEqual(["127.0.0.1:${APP_PORT:-5000}:5000"]);
    expect(app.volumes).toEqual(["${UPLOADS_HOST_PATH:?required}:/app/uploads"]);
    expect(app.networks).toEqual(["production"]);
    expect(productionNetwork).toMatchObject({
      external: "true",
      name: "${APP_NETWORK_NAME:?required}",
    });
    expect(environment).toMatchObject({
      NODE_ENV: "production",
      PORT: "5000",
      PUBLIC_APP_URL: "${PUBLIC_APP_URL:?required}",
      ENABLE_BEARER_EXCHANGE: "${ENABLE_BEARER_EXCHANGE:-false}",
      ENABLE_BEARER_AUTH: "${ENABLE_BEARER_AUTH:-false}",
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

  it("renders immutable SHA-tag and digest image references without concatenating them", async () => {
    const composeSource = await readProjectFile("docker-compose.yml");

    for (const imageReference of [syntheticShaTagReference, syntheticDigestReference]) {
      expect(imageReference).toMatch(immutableImageReference);
      const rendered = parseYamlMap(renderComposeTemplate(composeSource, syntheticComposeEnvironment(imageReference) as Record<string, string>));
      const app = asYamlMap(asYamlMap(rendered.services, "services").app, "services.app");
      const productionNetwork = asYamlMap(asYamlMap(rendered.networks, "networks").production, "networks.production");

      expect(app.image).toBe(imageReference);
      expect(String(app.image)).not.toContain(":@");
      expect(app.networks).toEqual(["production"]);
      expect(productionNetwork).toMatchObject({ external: "true", name: "politicall-production-test" });
    }

    expect("ghcr.io/example-org/politicall:latest").not.toMatch(immutableImageReference);
  });

  it("passes standalone docker-compose config for synthetic SHA-tag and digest references when available", async () => {
    if (!(await hasStandaloneDockerCompose())) return;

    for (const imageReference of [syntheticShaTagReference, syntheticDigestReference]) {
      await expect(execFileAsync("docker-compose", ["config", "--quiet"], {
        cwd: root,
        env: syntheticComposeEnvironment(imageReference),
      })).resolves.toBeDefined();
    }
  }, 20_000);

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
      IMAGE_REFERENCE: syntheticDigestReference,
      APP_PORT: "5000",
      APP_NETWORK_NAME: "<existing-external-docker-network>",
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
    expect(environment).not.toHaveProperty("IMAGE_REPOSITORY");
    expect(environment).not.toHaveProperty("IMAGE_TAG");
    expect(exampleSource).not.toMatch(/postgres(?:ql)?:\/\/[^\s"']+:[^\s"']+@/i);
    expect(exampleSource).not.toMatch(/(^|[^\w-])latest(?:$|[^\w-])/im);
  });

  it("documents immutable image preflight without claiming Compose validates the reference format", async () => {
    const [compose, example, portainer, backup] = await Promise.all([
      readProjectFile("docker-compose.yml"),
      readProjectFile(".env.example"),
      readProjectFile("docs/deployment/portainer-production.md"),
      readProjectFile("docs/deployment/backup-restore.md"),
    ]);

    expect(portainer).toContain("ghcr.io/<org>/<app>:sha-<commit>");
    expect(portainer).toContain("ghcr.io/<org>/<app>@sha256:<64-hex-digest>");
    expect(portainer).toContain("Compose only checks that `IMAGE_REFERENCE` is non-empty");
    expect(portainer).toContain("Digest references are preferred for production deploys and rollbacks");
    expect(portainer).toContain("IMAGE_REFERENCE and resolved digest");

    for (const source of [compose, example, portainer, backup]) {
      expect(source).not.toMatch(/(^|[^\w-])latest(?:$|[^\w-])/im);
    }
    for (const source of [compose, example, portainer]) {
      expect(source).not.toContain("IMAGE_REPOSITORY");
      expect(source).not.toContain("IMAGE_TAG");
    }
  });

  it("keeps the release plan and specification aligned with the complete immutable image reference", async () => {
    const [plan, specification] = await Promise.all([
      readProjectFile("docs/superpowers/plans/2026-07-29-release-foundation.md"),
      readProjectFile("docs/superpowers/specs/2026-07-29-release-foundation-design.md"),
    ]);

    for (const source of [plan, specification]) {
      expect(source).toContain("IMAGE_REFERENCE");
      expect(source).toContain("ghcr.io/<org>/<app>:sha-<commit>");
      expect(source).toContain("ghcr.io/<org>/<app>@sha256:<64-hex-digest>");
      expect(source).not.toContain("IMAGE_REPOSITORY");
      expect(source).not.toContain("IMAGE_TAG");
      expect(source).not.toMatch(/(^|[^\w-])latest(?:$|[^\w-])/im);
    }
    expect(plan).toContain("Decision update");
    expect(specification).toContain("Decisao atualizada");
  });

  it("connects the app to the pre-existing external PostgreSQL network", async () => {
    const portainer = await readProjectFile("docs/deployment/portainer-production.md");

    expect(portainer).toContain("APP_NETWORK_NAME");
    expect(portainer).toContain("docker network create <app-network-name>");
    expect(portainer).toContain("docker network connect <app-network-name> <postgres-container-name>");
    expect(portainer).toContain("database container DNS name");
    expect(portainer).toContain("host-published database port remains a legacy option");
    expect(portainer).toContain("The application remains attached to the external network");
  });

  it("requires quiescence before paired database and uploads backup", async () => {
    const backup = await readProjectFile("docs/deployment/backup-restore.md");
    const flow = markdownSection(backup, "Consistent Backup");

    expectTextInOrder(flow, [
      "Block inbound traffic and new writes",
      "Stop the application gracefully",
      "Confirm that no application writers remain",
      "IMAGE_REFERENCE and resolved digest",
      "politicall_schema_migrations",
      "pg_dump",
      "Archive the uploads",
      "Compute SHA-256 hashes for all three artifacts",
      "Validate the database dump",
      "Validate the uploads archive",
      "Validate the migration inventory hash",
      "Only after all three artifacts are validated",
    ]);
    for (const requiredRecord of [
      "database dump path and SHA-256 hash",
      "uploads archive path and SHA-256 hash",
      "migration inventory path and SHA-256 hash",
    ]) {
      expect(flow).toContain(requiredRecord);
    }
  });

  it("captures migration inventory without mutating a first-runner database", async () => {
    const backup = await readProjectFile("docs/deployment/backup-restore.md");
    const restoreHeading = "## Isolated Restore Validation (ambiente isolado)";
    const preflight = backup.slice(0, backup.indexOf(restoreHeading));
    const absentMarker = "politicall_schema_migrations=absent-before-production-runner";
    const mutatingSql = /\b(?:(?:CREATE|ALTER|DROP)\s+(?:TABLE|SCHEMA|DATABASE|INDEX|VIEW|TYPE|EXTENSION|FUNCTION|TRIGGER|SEQUENCE)|TRUNCATE\s+(?:TABLE\s+)?|INSERT\s+INTO|UPDATE\s+\S+\s+SET|DELETE\s+FROM|GRANT\s+|REVOKE\s+)\b/i;

    expectTextInOrder(preflight, [
      "SELECT to_regclass('public.politicall_schema_migrations')",
      "If the result is non-null",
      "SELECT name, hash, applied_at FROM politicall_schema_migrations ORDER BY name",
      "If the result is null",
      absentMarker,
      "Compute and record the SHA-256",
    ]);
    expect(preflight).toContain("write the marker locally");
    expect(preflight).toContain("runner creates `politicall_schema_migrations` on its first start");
    expect(preflight).toContain("pre-runner state");
    expect(preflight).not.toMatch(mutatingSql);
  });

  it("accepts the hashed pre-runner marker before isolated and production restore", async () => {
    const backup = await readProjectFile("docs/deployment/backup-restore.md");
    const absentMarker = "politicall_schema_migrations=absent-before-production-runner";
    const restoreSections = [
      markdownSection(backup, "Isolated Restore Validation (ambiente isolado)"),
      markdownSection(backup, "Production Restore"),
    ];

    for (const section of restoreSections) {
      expect(section).toContain(absentMarker);
      expect(section).toContain("accept the marker only when its SHA-256 hash matches");
    }
    expectTextInOrder(restoreSections[0], [
      "Verify all three SHA-256 hashes",
      absentMarker,
      "Restore the database",
    ]);
    expectTextInOrder(restoreSections[1], [
      "Verify all three SHA-256 hashes",
      absentMarker,
      "Restore the captured database dump",
    ]);
  });

  it("verifies all three pair hashes before isolated or production restore changes state", async () => {
    const backup = await readProjectFile("docs/deployment/backup-restore.md");
    const isolated = markdownSection(backup, "Isolated Restore Validation (ambiente isolado)");
    const production = markdownSection(backup, "Production Restore");

    expectTextInOrder(isolated, [
      "Verify all three SHA-256 hashes",
      "Restore the database",
      "Extract the paired uploads archive",
    ]);
    expectTextInOrder(production, [
      "Verify all three SHA-256 hashes",
      "Restore the captured database dump",
      "Restore the paired uploads archive",
    ]);
  });

  it("restores a captured database/uploads/image set before reopening traffic", async () => {
    const backup = await readProjectFile("docs/deployment/backup-restore.md");
    const flow = markdownSection(backup, "Production Restore");

    expectTextInOrder(flow, [
      "Keep inbound traffic and writes blocked",
      "Keep the application stopped",
      "Confirm that no application writers remain",
      "Verify all three SHA-256 hashes",
      "Restore the captured database dump",
      "Restore the paired uploads archive",
      "Select the compatible captured `IMAGE_REFERENCE`",
      "Start the application",
      "Wait for migrations",
      "/api/ready",
      "smoke checks",
      "Reopen traffic only after",
    ]);
    expect(backup).toContain("backward-compatible");
    expect(backup).toContain("restore the paired database and uploads artifacts");
  });

  it("keeps database credentials out of backup command arguments", async () => {
    const backup = await readProjectFile("docs/deployment/backup-restore.md");

    expect(backup).toContain("PGSERVICE");
    expect(backup).toContain("PGPASSFILE");
    expect(backup).toContain("0600");
    expect(backup).not.toContain("PGPASSWORD");
    expect(backup).not.toMatch(/postgres(?:ql)?:\/\/[^<\s/:@]+:[^<\s/@]+@/i);
  });

  it("ships Portainer and websocket proxy runbooks with matching APP_PORT guidance", async () => {
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
    expect(portainer).toContain("APP_PORT and the Nginx `proxy_pass` port must match");
    expect(portainer).toContain("http://127.0.0.1:<APP_PORT>/api/health");
    expect(nginx).toContain("location = /api/attendance/realtime");
    expect(nginx).toContain("default APP_PORT=5000");
    expect(nginx).toContain("update this proxy_pass port in the same change");
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
    const pinnedNodeRuntime = "node:24.18.0-trixie-slim@sha256:ae91dcc111a68c9d2d81ff2a17bda61be126426176fde6fe7d08ab13b7f50573";
    const productionStage = dockerfile.split(`FROM ${pinnedNodeRuntime} AS production`)[1];

    expect(dockerfile).toContain(`FROM ${pinnedNodeRuntime} AS builder`);
    expect(productionStage).toBeDefined();
    expect(productionStage).toContain("apt-get install -y --no-install-recommends tini");
    expect(productionStage).toContain("RUN npm ci --omit=dev");
    expect(productionStage).toContain("rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack");
    expect(productionStage).toContain("groupadd --gid 1001 nodejs");
    expect(productionStage).toContain("useradd --uid 1001 --gid nodejs");
    expect(productionStage).toContain("uploads/avatars uploads/backgrounds uploads/petitions uploads/temp");
    expect(productionStage).toContain("chown -R 1001:1001 /app/attached_assets /app/uploads");
    expect(productionStage).toContain('ENTRYPOINT ["/usr/bin/tini", "--"]');
    expect(productionStage).toContain("fetch('http://localhost:5000/api/health')");
    expect(productionStage).toContain('COPY --from=builder --chown=1001:1001 /app/migrations ./migrations');
    expect(productionStage).toContain('COPY --from=builder --chown=1001:1001 /app/scripts/full_schema.sql ./scripts/full_schema.sql');
    expect(productionStage).toContain('CMD ["sh", "-c", "node dist/migrate-production.js && exec node dist/index.js"]');
    expect(productionStage).not.toContain("wget");

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

  it("keeps the CI runtime deterministic and pins every action to a reviewed full SHA", async () => {
    const workflow = await readProjectFile(".github/workflows/build.yml");
    const expectedActions = [
      "actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd",
      "actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e",
      "docker/setup-buildx-action@4d04d5d9486b7bd6fa91e7baf45bbb4f8b9deedd",
      "docker/login-action@b45d80f862d83dbcd57f89517bcf500b2ab88fb2",
      "docker/build-push-action@f9f3042f7e2789586610d6e8b85c8f03e5195baf",
      "aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25",
      "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
      "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c",
    ];

    expect(workflow).toContain("NODE_VERSION: '24.18.0'");
    expect(workflow).not.toMatch(/npm\s+install\s+-g\s+npm(?:@latest)?/i);
    expect(workflow).not.toMatch(/(?:uses:\s*[^\s@]+@|npm@)(?:latest|master)\b/i);
    expect(workflow.match(/run: npm ci/g)).toHaveLength(3);
    expect(actionReferences(workflow)).toEqual(expect.arrayContaining(expectedActions));
    for (const reference of actionReferences(workflow)) {
      expect(reference).toMatch(/^[\w.-]+\/[\w.-]+@[a-f0-9]{40}$/);
    }
  });

  it("requires typecheck, real PostgreSQL migration tests, build, and security gates before Docker", async () => {
    const workflow = await readProjectFile(".github/workflows/build.yml");
    const build = workflowJob(workflow, "build");
    const security = workflowJob(workflow, "security");
    const docker = workflowJob(workflow, "docker");
    const publish = workflowJob(workflow, "publish");

    expect(workflow).toMatch(/^permissions:\n  contents: read$/m);
    expect(build).toContain("postgres:");
    expect(build).toMatch(
      /image: postgres:16@sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20\s+# reviewed 2026-07-29/,
    );
    expect(build).toContain("ports: [5432:5432]");
    expect(build).toContain("pg_isready");
    expect(build).toContain("POSTGRES_PASSWORD: ${{ github.run_id }}");
    expect(build).toContain("new URL('postgresql://127.0.0.1:5432/postgres')");
    expect(build).toContain("MIGRATION_TEST_DATABASE_URL");
    expect(build).toContain("npm test");
    expect(build).not.toMatch(/process\.env\.DATABASE_URL|^\s*DATABASE_URL=/m);
    expect(security).toContain("npm run security:secrets");
    expect(security).toContain("npm audit --omit=dev --audit-level=high");
    expect(security).not.toContain("continue-on-error: true");
    expect(docker).toContain("needs: [typecheck, build, security]");
    expect(docker).toContain("github.event_name == 'push'");
    expect(docker).toContain("github.ref == 'refs/heads/main'");
    expect(docker).toMatch(/permissions:\n      contents: read\n    outputs:/);
    expect(docker).not.toContain("packages: write");
    expect(docker).not.toContain("docker/login-action");
    expect(docker).not.toContain("docker push");
    expect(docker).not.toContain("security-events:");
    expect(publish).toContain("needs: docker");
    expect(publish).toContain("github.event_name == 'push'");
    expect(publish).toContain("github.ref == 'refs/heads/main'");
    expect(publish).toMatch(/permissions:\n      packages: write\n    env:/);
    expect(publish).not.toContain("contents:");
    expect(workflow.match(/packages: write/g)).toHaveLength(1);
  });

  it("transfers exactly one scanned SHA-tagged candidate to the isolated publish job", async () => {
    const [workflow, compose, portainer] = await Promise.all([
      readProjectFile(".github/workflows/build.yml"),
      readProjectFile("docker-compose.yml"),
      readProjectFile("docs/deployment/portainer-production.md"),
    ]);
    const docker = workflowJob(workflow, "docker");
    const publish = workflowJob(workflow, "publish");
    const buildCandidate = workflowStep(docker, "Build local Docker candidate");
    const trivy = workflowStep(docker, "Scan local Docker candidate with Trivy");
    const archive = workflowStep(docker, "Archive scanned Docker candidate");
    const upload = workflowStep(docker, "Upload scanned Docker candidate");
    const download = workflowStep(publish, "Download scanned Docker candidate");
    const checksum = workflowStep(publish, "Verify scanned Docker archive checksum");
    const load = workflowStep(publish, "Load scanned Docker candidate");
    const tag = workflowStep(publish, "Verify loaded Docker tag");
    const login = workflowStep(publish, "Login to GitHub Container Registry");
    const push = workflowStep(publish, "Push scanned Docker candidate");
    const uploadArtifactName = upload.match(/^\s+name:\s*(.+)$/m)?.[1];
    const downloadArtifactName = download.match(/^\s+name:\s*(.+)$/m)?.[1];
    const buildAction = "docker/build-push-action@f9f3042f7e2789586610d6e8b85c8f03e5195baf";

    expect(docker).toContain("tr '[:upper:]' '[:lower:]'");
    expect(docker).toContain("IMAGE_REFERENCE=ghcr.io/${repository}:sha-${GITHUB_SHA}");
    expect(buildCandidate).toContain(`uses: ${buildAction}`);
    expect(buildCandidate).toContain("platforms: linux/amd64");
    expect(buildCandidate).toContain("load: true");
    expect(buildCandidate).toContain("push: false");
    expect(trivy).toContain("image-ref: ${{ steps.image.outputs.reference }}");
    expect(trivy).toContain("severity: HIGH,CRITICAL");
    expect(trivy).toContain("exit-code: '1'");
    expect(trivy).toContain("ignore-unfixed: true");
    expect(trivy).not.toContain("version: latest");
    expect(archive).toContain('docker save "$IMAGE_REFERENCE" | gzip');
    expect(archive).toContain("sha256sum");
    expect(archive).toContain('echo "sha256=$archive_sha256" >> "$GITHUB_OUTPUT"');
    expect(upload).toContain(
      "uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1",
    );
    expect(upload).toContain("retention-days: 1");
    expect(upload).toContain("compression-level: 0");
    expect(uploadArtifactName).toBe("scanned-docker-image-${{ github.run_attempt }}");
    expect(downloadArtifactName).toBe(uploadArtifactName);
    expect(workflow).not.toMatch(/^\s+name:\s*scanned-docker-image\s*$/m);
    expectTextInOrder(docker, [buildCandidate, trivy, archive, upload]);
    expect(workflow.match(new RegExp(buildAction.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))).toHaveLength(1);
    expect(docker).toContain("image_reference: ${{ steps.image.outputs.reference }}");
    expect(docker).toContain("archive_sha256: ${{ steps.archive.outputs.sha256 }}");
    expect(download).toContain(
      "uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1",
    );
    expect(checksum).toContain("${{ needs.docker.outputs.archive_sha256 }}");
    expect(checksum).toContain("sha256sum");
    expect(checksum).toContain("actual_archive_sha256");
    expect(checksum).toContain("exit 1");
    expect(load).toContain("set -euo pipefail");
    expect(load).toContain("docker load");
    expect(tag).toContain('docker image inspect "$IMAGE_REFERENCE"');
    expectTextInOrder(publish, [download, checksum, load, tag, login, push]);
    expect(publish).toContain("IMAGE_REFERENCE: ${{ needs.docker.outputs.image_reference }}");
    expect(publish).not.toContain("actions/checkout");
    expect(publish).not.toContain("docker/build-push-action");
    expect(publish).not.toContain("trivy-action");
    expect(actionReferences(publish).filter((reference) => !reference.startsWith("actions/"))).toEqual([
      "docker/login-action@b45d80f862d83dbcd57f89517bcf500b2ab88fb2",
    ]);
    expect(buildCandidate).not.toContain("latest");
    expect(`${docker}\n${publish}`).not.toMatch(/:latest\b|type=ref|type=semver/);
    expect(syntheticShaTagReference).toMatch(/:sha-[0-9a-f]{40}$/);
    expect(syntheticShaTagReference).toMatch(immutableImageReference);
    expect(compose).toContain('image: "${IMAGE_REFERENCE:?required}"');
    expect(portainer).toContain("ghcr.io/<org>/<app>:sha-<commit>");
  });

  it("publishes only after fail-closed checksum, tag, and push-digest validation", async () => {
    const workflow = await readProjectFile(".github/workflows/build.yml");
    const docker = workflowJob(workflow, "docker");
    const publish = workflowJob(workflow, "publish");
    const push = workflowStep(publish, "Push scanned Docker candidate");

    expect(docker).toContain("if: ${{ github.event_name == 'push' && github.ref == 'refs/heads/main' }}");
    expect(publish).toContain("if: ${{ github.event_name == 'push' && github.ref == 'refs/heads/main' }}");
    expect(push).toContain('docker push "$IMAGE_REFERENCE"');
    expect(push).toContain("sha256:[0-9a-f]{64}");
    expect(push).toContain('digest="${BASH_REMATCH[1]}"');
    expect(push).toContain("exit 1");
    expect(push).toContain("${repository}@${digest}");
    expect(push).toContain("$GITHUB_STEP_SUMMARY");
    expect(publish).not.toContain("imagetools inspect");
  });

  it("configures bounded weekly Dependabot updates for npm and GitHub Actions", async () => {
    const dependabot = await readProjectFile(".github/dependabot.yml");

    expect(dependabot).toContain('package-ecosystem: "npm"');
    expect(dependabot).toContain('package-ecosystem: "github-actions"');
    expect(dependabot.match(/interval: "weekly"/g)).toHaveLength(2);
    expect(dependabot.match(/open-pull-requests-limit: 5/g)).toHaveLength(2);
    expect(dependabot).toContain('"dependencies"');
    expect(dependabot).toContain('"github-actions"');
  });
});

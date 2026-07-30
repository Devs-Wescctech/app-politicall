# Production Release Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a secret-safe, reproducible GitHub/GHCR release that Portainer can deploy against the existing external PostgreSQL container with deterministic migrations and rollback.

**Architecture:** GitHub Actions is the build authority and publishes immutable linux/amd64 images after every quality gate. The runtime image executes a lock-protected production migration runner before the Express process, keeps PostgreSQL outside the application stack, and persists uploads through a configurable host mount.

**Tech Stack:** Node.js 24 LTS, TypeScript, Express 4, PostgreSQL 16, Drizzle schema, Vitest, Docker Compose, GitHub Actions, GHCR, Trivy, Portainer Docker Standalone.

## Global Constraints

- PostgreSQL remains external to the Politicall Compose project.
- No real token, password, private key, connection string, upload, database dump, or Vault file may enter Git, Docker context, logs, or documentation.
- The currently running production container is not modified by this plan.
- Production deployments use a complete immutable `IMAGE_REFERENCE` in either `ghcr.io/<org>/<app>:sha-<commit>` or `ghcr.io/<org>/<app>@sha256:<64-hex-digest>` form.
- Decision update: the original split image variables were replaced by one complete reference so Portainer supports both SHA tags and digest-pinned deploys without concatenation.
- A failed migration prevents application startup.
- Existing Excel import/export behavior must remain covered by automated tests.
- Node.js 24 LTS is the only CI and container runtime.

---

### Task 1: Create the safety checkpoint and lock down file selection

**Files:**
- Modify: `.gitignore`
- Modify: `.dockerignore`
- Modify: `package.json`
- Create: `scripts/check-release-secrets.mjs`
- Create: `tests/release-secret-scan.test.ts`
- Create: `uploads/.gitkeep`
- Modify: `tests/deployment-config.test.ts`

**Interfaces:**
- Consumes: Current workspace and existing local PostgreSQL backup tooling.
- Produces: A reviewed candidate file set safe for later `git add`.

- [ ] **Step 1: Create a pre-change backup outside the Git candidate set**

Run a PowerShell backup that excludes `.git`, `node_modules`, `dist`, `.runtime/pgdata`, `backups`, `graphify-out`, the Obsidian Vault, and environment files. Store the archive under `backups/production-hardening-<timestamp>/` and create a local `pg_dump` when the development database is available.

Expected: archive and optional dump exist; neither is staged by Git.

- [ ] **Step 2: Add failing deployment tests**

Add the ignore guarantees to `tests/deployment-config.test.ts` and scanner fixtures to
`tests/release-secret-scan.test.ts`. The scanner tests must reject private-key markers,
credential-bearing database URLs and high-confidence secret assignments while allowing
documented placeholders.

Core ignore guarantees:

```ts
it("excludes local knowledge, runtime state, uploads, and backups from Git", async () => {
  const ignore = await readProjectFile(".gitignore");
  for (const pattern of ["/Obsidian Vault/", "/graphify-out/", "/.runtime/", "/backups/", "/uploads/*"]) {
    expect(ignore).toContain(pattern);
  }
  expect(ignore).toContain("!/uploads/.gitkeep");
});

it("excludes private local artifacts from the Docker build context", async () => {
  const ignore = await readProjectFile(".dockerignore");
  for (const pattern of [".runtime/", "backups/", "Obsidian Vault/", "graphify-out/", "*.zip"]) {
    expect(ignore).toContain(pattern);
  }
});
```

- [ ] **Step 3: Verify RED**

Run: `npm test -- tests/deployment-config.test.ts`

Expected: FAIL because the new ignore entries are absent.

- [ ] **Step 4: Implement the ignore policy**

Append exact anchored Git patterns and Docker context patterns. Keep `attached_assets/`
versioned and keep only `uploads/.gitkeep` from user uploads.

Implement `scripts/check-release-secrets.mjs` to scan the NUL-delimited candidate list
from `git ls-files --cached --others --exclude-standard -z`. Skip binary files and files
larger than 5 MB, print only path/rule/line metadata, and never echo the matched value.
Expose it as `npm run security:secrets`.

- [ ] **Step 5: Verify GREEN and scan candidate paths**

Run:

```powershell
npm test -- tests/deployment-config.test.ts
npm test -- tests/release-secret-scan.test.ts
npm run security:secrets
git status --short --untracked-files=all
```

Expected: tests and scan PASS; no Vault contents, runtime files, backups, uploads, logs,
zips, environment files, or detected secrets appear as candidates.

- [ ] **Step 6: Commit**

```powershell
git add .gitignore .dockerignore package.json scripts/check-release-secrets.mjs tests/release-secret-scan.test.ts uploads/.gitkeep tests/deployment-config.test.ts
git commit -m "chore: protect release context from local data"
```

### Task 2: Remove high-severity production dependency findings

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tests/excel-regression.test.ts`
- Modify: `tests/deployment-config.test.ts`

**Interfaces:**
- Consumes: Existing Excel and archive APIs.
- Produces: Runtime dependency graph with zero high/critical npm audit findings.

- [ ] **Step 1: Add Excel round-trip and archive compatibility tests**

Create a Vitest test that builds a workbook with accented text, date, integer and formula, writes it to a buffer, reloads it and verifies each value. Add a test for the existing direct `archiver` workflow using an in-memory stream.

Core guarantee:

```ts
expect(reloaded.getWorksheet("Dados")?.getCell("A2").value).toBe("São Paulo");
expect(reloaded.getWorksheet("Dados")?.getCell("B2").value).toBe(42);
```

- [ ] **Step 2: Capture RED security evidence**

Run:

```powershell
npm test -- tests/excel-regression.test.ts
npm audit --omit=dev --audit-level=high
```

Expected: functional test PASS on the old graph; audit FAIL with high-severity findings.

- [ ] **Step 3: Reclassify build-only packages**

Move `vitest`, all `@types/*`, `tailwindcss-animate`, and other test/build-only packages from `dependencies` to `devDependencies`. Keep packages imported by `dist/index.js` in `dependencies`.

- [ ] **Step 4: Upgrade and override patched chains**

Apply:

```json
{
  "engines": { "node": ">=24 <25" },
  "dependencies": {
    "archiver": "^8.0.0",
    "googleapis": "^173.0.0"
  },
  "overrides": {
    "esbuild": "0.28.1",
    "uuid": "11.1.1",
    "exceljs": { "archiver": "8.0.0" },
    "brace-expansion@1.1.16": "1.1.17",
    "brace-expansion@2.1.2": "2.1.3"
  }
}
```

Regenerate the lockfile with `npm install`. Do not run `npm audit fix --force`.

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
npm test -- tests/excel-regression.test.ts
npm test
npm audit --omit=dev --audit-level=high
```

Expected: Excel/archive tests PASS, full suite PASS, audit exits 0 with no high/critical finding.

- [ ] **Step 6: Commit**

```powershell
git add package.json package-lock.json tests/excel-regression.test.ts tests/deployment-config.test.ts
git commit -m "fix: remove high severity runtime dependency findings"
```

### Task 3: Produce a minimal Node.js 24 runtime image

**Files:**
- Modify: `server/vite.ts`
- Create: `server/vite-runtime.test.ts`
- Modify: `Dockerfile`
- Modify: `tests/deployment-config.test.ts`

**Interfaces:**
- Consumes: `setupVite(app, server)`, `serveStatic(app)`, and `log(message)`.
- Produces: Production bundle that does not resolve Vite or development packages at startup.

- [ ] **Step 1: Write the failing production-runtime test**

Test that importing the built server in production does not require the `vite` package and that `Dockerfile` uses Node 24 with `npm ci --omit=dev` in the final stage.

- [ ] **Step 2: Verify RED**

Run: `npm test -- server/vite-runtime.test.ts tests/deployment-config.test.ts`

Expected: FAIL because Vite is imported statically and the runtime installs all dependencies.

- [ ] **Step 3: Make Vite development-only**

Replace the top-level Vite import with a dynamic import inside `setupVite`:

```ts
export async function setupVite(app: Express, server: Server) {
  const { createServer: createViteServer, createLogger } = await import("vite");
  const viteLogger = createLogger();
  // preserve the existing middleware and error behavior
}
```

Keep `serveStatic` and `log` free of Vite imports.

- [ ] **Step 4: Verify the application entry point**

Keep the existing `server/index.ts` production build and assert that it emits
`dist/index.js`. The migration entry point is added only after its source and tests exist
in Task 4.

- [ ] **Step 5: Rewrite the Dockerfile**

Use `node:24.18.0-bookworm-slim` in build and runtime stages. The runtime stage installs
`wget` and `tini`, runs `npm ci --omit=dev`, copies `dist/` and `attached_assets/`, and
creates writable upload directories owned by UID 1001.

Use:

```dockerfile
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
```

- [ ] **Step 6: Verify GREEN**

Run:

```powershell
npm test -- server/vite-runtime.test.ts tests/deployment-config.test.ts
npm run build
```

Expected: tests and build PASS; production bundle imports no top-level Vite runtime.

- [ ] **Step 7: Commit**

```powershell
git add server/vite.ts server/vite-runtime.test.ts Dockerfile tests/deployment-config.test.ts
git commit -m "build: create minimal node 24 production image"
```

### Task 4: Add deterministic production migrations

**Files:**
- Create: `server/services/production-migrations.ts`
- Create: `server/services/production-migrations.test.ts`
- Create: `scripts/migrate-production.ts`
- Modify: `package.json`
- Modify: `Dockerfile`

**Interfaces:**
- Consumes: `PROD_DATABASE_URL`, `scripts/full_schema.sql`, and migrations `0001_add_permissions.sql`, `0002_remove_permissions_default.sql`, `0003_add_google_event_id.sql`, `0005_attendance_omni.sql` through `0009_petitionsbr_module.sql`.
- Produces: `runProductionMigrations(pool, rootDir): Promise<MigrationRunResult>`.

- [ ] **Step 1: Write RED tests with a fake database adapter**

Cover:

- baseline runs only when `accounts` is absent;
- migration hash and name are persisted;
- already-recorded migrations are skipped;
- advisory lock is acquired and released;
- migration failure rolls back and rejects;
- no seed script is referenced.

Define:

```ts
export interface MigrationRunResult {
  baselineApplied: boolean;
  applied: string[];
  skipped: string[];
}
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- server/services/production-migrations.test.ts`

Expected: FAIL because the migration service does not exist.

- [ ] **Step 3: Implement the migration service**

Use `pg.PoolClient`, `pg_advisory_lock(741_2026_07)`, a `politicall_schema_migrations` table, SHA-256 file hashes, and one transaction per migration. Reject a previously-recorded migration whose current hash differs.

- [ ] **Step 4: Implement the CLI**

`scripts/migrate-production.ts` must require `NODE_ENV=production` and `PROD_DATABASE_URL`, invoke the service, print only migration IDs/counts, close the pool, and exit non-zero on failure.

- [ ] **Step 5: Wire the migration artifact into build and startup**

Update the build script to compile both `server/index.ts` and
`scripts/migrate-production.ts` into `dist/`. Copy `migrations/` and
`scripts/full_schema.sql` into the runtime image, then replace the Docker command with:

```dockerfile
CMD ["sh", "-c", "node dist/migrate-production.js && exec node dist/index.js"]
```

- [ ] **Step 6: Verify GREEN**

Run:

```powershell
npm test -- server/services/production-migrations.test.ts
npm run build
```

Expected: PASS and `dist/migrate-production.js` exists.

- [ ] **Step 7: Commit**

```powershell
git add server/services/production-migrations.ts server/services/production-migrations.test.ts scripts/migrate-production.ts package.json Dockerfile
git commit -m "feat: add locked production migration runner"
```

### Task 5: Add production lifecycle and readiness guarantees

**Files:**
- Create: `server/server-lifecycle.ts`
- Create: `server/server-lifecycle.test.ts`
- Modify: `server/index.ts`
- Modify: `server/attendance-events.ts`
- Modify: `server/health.ts`

**Interfaces:**
- Consumes: HTTP server, WebSocket server, PostgreSQL pool.
- Produces: `installGracefulShutdown({ server, closeRealtime, closeDatabase, timeoutMs })`.

- [ ] **Step 1: Write RED tests**

Test that `SIGTERM` stops accepting requests, closes realtime, closes the DB pool once, and forces exit after the configured timeout. Test readiness returns 503 on DB failure.

- [ ] **Step 2: Verify RED**

Run: `npm test -- server/server-lifecycle.test.ts server/health.test.ts`

Expected: lifecycle test FAIL.

- [ ] **Step 3: Implement lifecycle**

Export `closeAttendanceRealtime(): Promise<void>` to clear heartbeat, close clients, and close the WebSocketServer. Install signal handlers only from `server/index.ts` after `listen`.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- server/server-lifecycle.test.ts server/health.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add server/server-lifecycle.ts server/server-lifecycle.test.ts server/index.ts server/attendance-events.ts server/health.ts
git commit -m "feat: add graceful production lifecycle"
```

### Task 6: Create the Portainer Compose contract and operations runbook

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env.example`
- Create: `docs/deployment/portainer-production.md`
- Create: `docs/deployment/nginx-websocket.conf`
- Create: `docs/deployment/backup-restore.md`
- Modify: `tests/deployment-config.test.ts`

**Interfaces:**
- Consumes: Existing external PostgreSQL and host upload directory.
- Produces: Portainer environment contract with no embedded credentials.

- [ ] **Step 1: Write RED configuration tests**

Require `${IMAGE_REFERENCE}`, `${APP_NETWORK_NAME}`, `${UPLOADS_HOST_PATH}`, `/api/ready`, log rotation, stop grace period, `no-new-privileges`, an external production network, and mandatory secret placeholders. Reject literal database URLs and mutable image references.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/deployment-config.test.ts`

Expected: FAIL on the old Compose.

- [ ] **Step 3: Implement Compose**

Use:

```yaml
services:
  app:
    image: "${IMAGE_REFERENCE:?required}"
    ports:
      - "127.0.0.1:${APP_PORT:-5000}:5000"
    environment:
      NODE_ENV: production
      PORT: 5000
      PROD_DATABASE_URL: "${PROD_DATABASE_URL:?required}"
      SESSION_SECRET: "${SESSION_SECRET:?required}"
      DATA_ENCRYPTION_KEY: "${DATA_ENCRYPTION_KEY:?required}"
      ADMIN_MASTER_PASSWORD_HASH: "${ADMIN_MASTER_PASSWORD_HASH:?required}"
      TRUST_PROXY: "${TRUST_PROXY:-1}"
    volumes:
      - "${UPLOADS_HOST_PATH:?required}:/app/uploads"
    networks:
      - production

networks:
  production:
    external: true
    name: "${APP_NETWORK_NAME:?required}"
```

Add readiness health check, resource limits, logging limits and a 30-second stop grace period. The external network must be pre-created and shared with the existing PostgreSQL container; this stack must not create a database service.

- [ ] **Step 4: Write runbooks**

Document Portainer registry setup, complete immutable image reference entry, external-network preflight, production backup with hashes for database/uploads/migration inventory, paired restore validation, smoke, rollback to the captured digest, and the Nginx WebSocket block. Never include real values.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- tests/deployment-config.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add docker-compose.yml .env.example docs/deployment tests/deployment-config.test.ts
git commit -m "ops: add portainer production contract"
```

### Task 7: Turn CI security into a publishing gate

**Files:**
- Modify: `.github/workflows/build.yml`
- Create: `.github/dependabot.yml`
- Modify: `tests/deployment-config.test.ts`

**Interfaces:**
- Consumes: GitHub Actions `GITHUB_TOKEN`.
- Produces: GHCR SHA image only after typecheck, tests, audit, build and Trivy pass.

- [ ] **Step 1: Write RED workflow tests**

Assert Node 24, no global npm update, `npm run security:secrets`, Docker
`needs: [typecheck, build, security]`, Trivy `exit-code: "1"`, SHA tags,
least-privilege permissions, and reviewed fixed action versions.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/deployment-config.test.ts`

Expected: FAIL against the old workflow.

- [ ] **Step 3: Implement workflow and Dependabot**

Keep pull requests build-only. On `main`, build the candidate image locally, run Trivy before push, then publish GHCR tags after all gates. Add weekly npm and GitHub Actions Dependabot updates.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npm test -- tests/deployment-config.test.ts
npm run check
npm test
npm run build
npm run security:secrets
npm audit --omit=dev --audit-level=high
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```powershell
git add .github/workflows/build.yml .github/dependabot.yml tests/deployment-config.test.ts
git commit -m "ci: block image publication on security gates"
```

### Task 8: Record release evidence

**Files:**
- Create: `docs/testing/production-release-foundation.tdd.md`
- Modify: `docs/project/2026-07-22-auditoria-refatoracao.md`

**Interfaces:**
- Consumes: Actual RED/GREEN outputs from Tasks 1-7.
- Produces: Auditable release evidence and known external handoff items.

- [ ] **Step 1: Run the complete local gate**

Run:

```powershell
npm run check
npm test
npm run build
npm run security:secrets
npm audit --omit=dev --audit-level=high
```

Expected: all exit 0.

- [ ] **Step 2: Run production-mode smoke on an alternate local port**

Use local test credentials only through environment variables, start `dist/index.js` with `NODE_ENV=production`, verify `/api/health`, `/api/ready`, login and static assets, then terminate the smoke process.

- [ ] **Step 3: Write factual evidence**

Record commands, counts, RED and GREEN evidence, local Docker limitation, and external tasks requiring GitHub/Portainer access.

- [ ] **Step 4: Commit**

```powershell
git add docs/testing/production-release-foundation.tdd.md docs/project/2026-07-22-auditoria-refatoracao.md
git commit -m "docs: record production release evidence"
```

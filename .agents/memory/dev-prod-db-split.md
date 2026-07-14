---
name: Dev/Prod DB split via PROD_DATABASE_URL
description: How the workspace dev DB (Replit managed) and the external production DB are separated.
---

# Dev/Prod DB split

The workspace now uses the Replit-managed PostgreSQL (host: `helium`, database: `heliumdb`, PostgreSQL 16.10) as its development/test database. The external production DB at `204.157.108.76:5432/politicall` is kept for the published/deployed site.

**Why:** Provisioning a Replit-managed DB replaces the global `DATABASE_URL` secret. Without a separate `PROD_DATABASE_URL` path, the published site would point at the empty managed dev DB on next publish.

## Connection selection rule (server/db.ts)
In production (`NODE_ENV=production`) the code now **requires** `PROD_DATABASE_URL` — if it is missing the process throws at startup (fast-fail) rather than silently falling back to the dev DB.
In development `DATABASE_URL` (the managed DB) is used.

## How to apply
- **Dev testing:** run the workspace — `DATABASE_URL` = managed Replit DB automatically.
- **Before publishing:** set the `PROD_DATABASE_URL` secret in Replit Secrets with the external production DB connection string. The published site will use it on next deploy. Without it the production server will **crash on start** (intentional fail-fast).
- **Migrations to production:** the external DB is still managed via the EMIT_SQL pattern (see `attendance-external-db-access.md`). Do NOT run `db:push` from the workspace against prod.

## Removing conflicting global secrets
User must manually delete `DATABASE_URL`, `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` global secrets from the Replit Secrets panel before `createDatabase()` will provision a fresh managed DB. The agent `deleteEnvVars` tool appears to succeed on these when called with `environment: "shared"`, but the bash shell env is only refreshed after a workflow restart.

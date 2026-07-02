---
name: External DB unreachable from workspace (pg_hba allowlist)
description: Why attendance DB migration + live smoke test cannot run in the Replit workspace, and how they must be applied.
---

The Politicall production PostgreSQL (external, host allow-listed) rejects the Replit
workspace's egress IP at the `pg_hba.conf` layer. Symptom from the `pg` driver:
`FATAL 28000 no pg_hba.conf entry for host "<workspace-egress-ip>", user "auth_bd",
database "politicall"` — reproduced in **every** SSL mode (ssl:false, ssl:true,
ssl:{rejectUnauthorized:false}, ssl:{require:true}). The `executeSql` agent tool also
fails (psql misparses the URL). So the workspace cannot reach this DB at all.

**Why:** the DB firewall/pg_hba only allows the production deployment's IP, not the
ephemeral workspace IP. This is an access/infra restriction, not a code or SSL bug.

**How to apply:**
- Schema→SQL generator: `scripts/apply-attendance-migration.ts`.
  - `EMIT_SQL=1 npx tsx scripts/apply-attendance-migration.ts` writes an idempotent
    `migrations/0005_attendance_omni.sql` (CREATE TABLE IF NOT EXISTS for the 18
    attendance tables + ADD COLUMN IF NOT EXISTS for additive integrations columns).
    No DB connection needed — safe to run in the workspace.
  - Running it without `EMIT_SQL` tries to connect and apply directly; this only works
    from an environment whose IP is allow-listed (i.e. the deployment), not the workspace.
- The additive SQL is idempotent and non-destructive; apply it against production
  (via the deployment shell or a whitelisted host), then run
  `node scripts/attendance-smoke-test.mjs` against a server that can reach the DB.
- Code-level verification that DOES work in-workspace: `npx tsc --noEmit` and `npm run build`.

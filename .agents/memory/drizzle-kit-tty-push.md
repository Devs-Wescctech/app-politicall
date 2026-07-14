---
name: drizzle-kit push needs a TTY for new tables
description: db:push fails non-interactively when it must ask create-vs-rename; apply additive SQL instead
---

`npm run db:push` (drizzle-kit) aborts with "Interactive prompts require a TTY terminal"
(promptNamedWithSchemasConflict / tablesResolver) whenever the diff includes brand-new
tables — it wants to ask whether each is *created* or *renamed* from an existing one.
The agent bash shell has no TTY, so it always errors out.

**Why:** drizzle-kit can't guess create-vs-rename; the resolver is interactive-only.

**How to apply:** For purely additive, backward-compatible changes (new tables, new
nullable columns, default changes), skip db:push and apply idempotent SQL directly via
`psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f file.sql` using
`ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`. This is also safer than
letting drizzle guess a rename (which could drop/rename real columns). Verify with
`\d <table>` afterwards. Dev DB is the Replit-managed one (DATABASE_URL host=helium).

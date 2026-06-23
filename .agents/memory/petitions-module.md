---
name: Petições module & external DB reachability
description: How the Petições module is wired into Politicall and why runtime testing is blocked in the workspace.
---

## External DB unreachable from workspace
The Politicall app uses a SINGLE external Postgres (kept identical for dev+prod per user decision). That host rejects the workspace IP via pg_hba, so `db:push` and any runtime/data testing CANNOT run in the dev workspace — they only succeed after publish/merge.
**Why:** user chose to point dev at the same external DB instead of provisioning a new one.
**How to apply:** for schema/data changes, verify with `npx tsc --noEmit` + `npm run build` (both must pass) instead of runtime tests; actual table creation/e2e happens on merge.

## Petições module shape
Internal module reusing Politicall auth/tenancy (accountId+userId scoped), gated by the existing `petitions` permission (admin+coordenador).
- Tables live in shared/schema.ts; all model fields are camelCase in code (Drizzle).
- Admin UI: single page client/src/pages/petitions.tsx with shadcn Tabs (petitions, campaigns, templates, link bio, link tree).
- Public pages (no auth) by slug: /p/:slug (sign), /bio/:slug, /tree/:slug — registered in App.tsx top-level Switch.
- Public API under /api/public/petitions|linkbio|linktree; authed CRUD under /api/petitions etc.
- Authed binary downloads (QR png, signatures PDF) can't use <img>/window.open because they need the Bearer token — fetch as blob with Authorization header from getAuthToken(), then objectURL/download.
- SSR OG tags for crawlers added in server/index.ts for /p/:slug (mirrors the /apoio/:slug handler).

## Two non-obvious decisions
- **Slugs are GLOBALLY unique on purpose** (petitions, linkbio, linktree). Public pages resolve by slug alone (no account in the URL), so a per-account slug would be ambiguous. Creation must therefore auto-dedupe (append -2, -3, …) on collision instead of erroring, mirroring Politicall's candidate-slug loop. **Why:** earlier a hard "slug em uso" error blocked one account from creating a slug another account already had.
- **WhatsApp campaign dispatch** posts per-recipient to the wescctech gateway (`/core/v2/api/chats/send-text`, header `access-token`) using a token the user supplies at send time; no token = explicit 400 (no silent mock). Recipients = signatures (with phone) of the campaign's linked petition(s); each send writes a campaign log row.

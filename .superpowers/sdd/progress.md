# Subagent-Driven Development Progress

Branch base: `261cc9c`
Plan order:
1. Production Release Foundation (Tasks 1-8)
2. Authentication and HTTP Security Hardening (Tasks 1-8)
3. Attendance Realtime Resilience (Tasks 1-6)

Baseline verification:
- `npm run check`: passed
- `npm test`: 51 files, 351 tests passed
- `npm run build`: passed
- Local PostgreSQL backup: not created because the development instance was offline
- Source/uploads backup: created outside the worktree in the ignored local backup area

Completed tasks:
- Release Foundation Task 1: complete (commits `261cc9c..5a03117`, review clean; minor external action: revoke the removed credential and purge the historical blob before any public release).
- Release Foundation Task 2: complete (commits `5a03117..f85a1a2`, review clean; minor: use the final lock state, not the stale intermediate concern wording, in consolidated evidence).
- Release Foundation Task 3: complete (commits `f85a1a2..004a20f`, review clean; minor: remove the unused `os` import from `server/vite-runtime.test.ts` during final cleanup).
- Release Foundation Task 4: complete (commits `004a20f..f0d0594`, review approved with no Critical/Important findings; PostgreSQL integration is safely gated by `MIGRATION_TEST_DATABASE_URL` and remains locally skipped; minor: make integration cleanup best-effort independent during final cleanup).
- Release Foundation Task 5: complete (commits `f0d0594..f67dacc`, final review clean; Node 24 probes cover active HTTP drain, pending and unsupported WebSocket upgrades, setup/close races, readiness, timeout, and DB-last shutdown).
- Release Foundation Task 6: complete (commits `f67dacc..4d2ed65`, final review clean; Portainer uses immutable `IMAGE_REFERENCE`, an external shared Docker network, and state-consistent DB/uploads/migration-inventory backup and rollback).
- Release Foundation Task 7: complete (commits `4d2ed65..8e82fee`, final review clean; PostgreSQL 16 integration is wired into CI, all actions are SHA-pinned, build/Trivy run without registry write permission, and only the checksum-verified scanned artifact reaches the GHCR publish job).
- Release Foundation Task 8: complete (commits `8e82fee..108f157`, independent review approved with no Critical/Important findings; full gate passed with 422 tests plus 1 safely skipped PostgreSQL 16 test, and the isolated PostgreSQL 18 production smoke validated idempotent migrations, health/readiness, login, HTML, assets, listener, and cleanup).

Completed authentication tasks:
- Authentication Task 1: complete (commits `108f157..bd2bfe8`; third re-review approved with no Critical/Important/Minor findings; 24 focused tests locally with 2 gated skips, plus controller PostgreSQL 18.4 validation with 2 integration files/2 tests passed and 0 skips).
- Authentication Task 2: complete (commits `fc91598..b150dd9`; re-review approved with no Critical/Important findings after enforcing exact 15-minute JWT temporal claims and adding a trusted refresh-session resolver for CSRF; 24 focused tests, typecheck, build, secret scan, and production audit passed).
- Authentication Task 3: complete (commits `c7c661f..4ec3d7d`; final independent re-review approved with no Critical/Important findings; PostgreSQL 18 disposable validation passed the real store/concurrency integration test with all 9 approved migrations and 0 skips; full suite passed with 509 tests and 2 environment-gated skips).
- Authentication Task 4: complete (commits `4ec3d7d..a8a52f8`; third independent re-review approved with no Critical/Important/Minor findings after removing the `X-Admin-Token` authority, sharing the exact historical tenant-token predicate, binding rate limits to real Express routes, preserving hardening headers on rejection, supporting Vite development under a production-strict CSP, pinning byte-accurate body limits, and redacting unmatched error paths; full suite passed with 531 tests and 2 environment-gated skips).
- Authentication Task 5: complete (commits `7645fe4..7f23bd2`; first `CHANGES_REQUIRED` review remediated through GREEN `96f05af`; second `CHANGES_REQUIRED` review remediated with RED `0795478` and GREEN `836dd8d`; third `CHANGES_REQUIRED` review remediated with RED commits `b3ed07d`, `4ba65ad`, `e787f68` and GREEN `7f23bd2`; generation-safe stale operation handling, claim-indexed/bounded refresh coordination with post-window result consumption, and symbol-scoped TypeScript credential gates; 38 focused tests and the full 569-test suite passed with 2 existing environment-gated skips).

Current task:
- Authentication Task 6 is complete (initial RED/GREEN `3a6024e..8687257`; first review RED/GREEN `eed13f1..cea213a`; second review RED/GREEN `71ddec1..78e1bec`). The second remediation invalidates terminal 401/exact-auth-403 retries and remote refresh failures only after coordinator result publication, retains functional 403 sessions, closes the stale target-role profile bypass, removes dead admin response branches in favor of bounded generic errors, and extends conservative AST fixtures for every executable Authorization/storage mutation. Focused second-review suite: 3 files / 18 tests. Full suite: 76 files / 588 tests, with 2 existing environment-gated skips. `npm run check`, `npm run build`, `npm run security:secrets`, `npm audit --omit=dev --audit-level=high`, and `git diff --check 7f23bd2..HEAD` passed; audit reported 0 vulnerabilities. No production service, Portainer, remote Git endpoint, or real secret was accessed or changed. See `auth-task-6-report.md`.

Final-review minor triage:
- Registration still persists account, user, and initial session separately. Make this workflow transactional or compensating before release so account/session failures cannot leave orphaned or unretryable partial registration state.
- Login concurrency tests deterministically cover the hash change between issuance and authoritative re-read. Add deterministic coverage for the inverse ordering (password transaction wins before session issuance) for both tenant user and global admin, even though the shared principal advisory lock and transactional broad revocation currently enforce the behavior.
- Browser authentication rate-limit state is process-local. The documented single-app-container deployment is covered; require a shared bounded store before horizontally scaling the app service.
- Remove the `ENABLE_BEARER_AUTH` and `ENABLE_BEARER_EXCHANGE` compatibility paths after the client rollout/smoke window rather than leaving them as permanent dormant code.

Upcoming compatibility decision:
- Authentication Task 2 must use the actual `cookie@2.0.1` API (`parseCookie`) rather than the stale `cookie.parse` wording in the plan; the package requires Node 22+ and the project production runtime is Node 24.

Auth-plan integration notes for later tasks:
- Registration and impersonation currently emit/store raw JWTs too; Task 3/5/6 must migrate those flows, not only the two login pages.
- User and global-admin CSRF state should use distinct readable cookie names so both session kinds can coexist in one browser.
- `PUBLIC_APP_URL` is not yet present in `.env.example` or `docker-compose.yml`; the CSRF Origin allowlist must be fail-closed in production and the deploy contract must add it.
- `scripts/setup-dev-db.ts`, `scripts/attendance-smoke-test.mjs`, and the development branch of `seedAdminUser()` still contain `admin123`. Before auth completion, remove fixed fallbacks, never reset an existing password, require an explicit local-only input or generate a one-time credential, and test production/URL guards. Replace shell-built `psql` invocation in the dev bootstrap with structured `execFileSync` arguments.
- Refresh rotation must preserve the original family expiry instead of sliding another 7d/4h on every use (RFC 9700 replay guidance plus the plan's maximum lifetime). Task 3 should remove caller-controlled replacement expiry, and cookie max-age after rotation should use only the remaining family lifetime.
- Refresh and refresh-CSRF resolution must locate the database session from the refresh-token hash without relying on client-supplied tenant or principal identifiers; the current scoped store API needs a narrow trusted lookup before rotation.
- Because refresh cookies are intentionally scoped to `/api/auth/refresh` and `/api/admin/auth/refresh`, Task 3/5 must make logout after access expiry revocable without broadening the cookie path (for example, a CSRF-protected DELETE on the refresh path or a controlled refresh-before-logout flow).
- Authentication Tasks 5/6 must migrate direct credential call sites beyond the original file list: `pages/users.tsx`, `pages/contacts.tsx`, `pages/petitions.tsx`, `pages/attendance.tsx`, `components/recipient-source.tsx`, registration, contracts impersonation, and settings profile/admin bypass flows. Preserve documented `Bearer pk_*` API-key examples and third-party integration Authorization headers. The attendance WebSocket query token is handled by the separate realtime plan.
- Authentication Task 8 must add a reader-facing API contract for the new user/admin login, CSRF, refresh, exchange and logout endpoints (methods, cookies/headers, request/response schemas, status codes, limits and rollout flags); no dedicated auth API contract exists yet.
- `scripts/attendance-smoke-test.mjs` still asserts raw login tokens and sends Bearer credentials. Migrate it to a cookie jar plus CSRF during Tasks 5/8 (and cookie WebSocket transport in the realtime milestone); preserve it as an executable smoke rather than deleting it. Production smoke requests must send the configured exact Origin.
- Task 5 cannot preserve the current synchronous `isAuthenticated() => !!localStorage.auth_token` guard. Bootstrap auth from `/api/auth/me` through an explicit loading/authenticated/unauthenticated state; avoid redirect flicker and redirect only after refresh/me resolution. A cached non-sensitive display user is not proof of an active session.
- Task 5 should deduplicate refresh calls through one shared in-flight promise; consider cross-tab coordination before Browser QA because strict refresh replay detection can revoke a family when two tabs rotate the same cookie concurrently.
- Task 4 must apply cookie-session validation and CSRF to both tenant-user and global-admin route middleware. The current global-admin middleware is private inside `server/routes.ts`; leaving it Bearer-only would make the new admin cookies unusable outside auth endpoints.
- Authentication Task 7 rotation inventory must include only known encrypted columns: `integrations` secret fields, the 15 `AI_CONFIG_PROVIDER_SECRET_FIELDS` plus `ai_configurations.openai_api_key`, `channel_connections.token`, and Google Calendar `client_secret/access_token/refresh_token`. Current `includes(\":\")` encrypted-value heuristics in routes/attendance misclassify plaintext containing colons and must be replaced by explicit legacy/v2 format recognition; AI secret detection must recognize v2.
- Security finding for Task 7/final hardening: `channel_connections.metadata.webhookSecret` is compared in plaintext and connection responses mask only `token`, so a supplied webhook secret can be persisted and returned unmasked. Add explicit encryption/masking/constant-time verification for that known nested field and include it in rotation, or remove the unsupported metadata credential path.
- Redact Google OAuth failures before production: `server/routes.ts` logs full `tokenError.response?.data || tokenError` and refresh errors, which may carry request config/credentials. Keep only bounded provider code/status/message and never log request headers, client secrets, tokens or full SDK error objects.
- Task 4 CSP must preserve existing embeds with a narrow `frame-src` allowlist for `drive.google.com`, `www.youtube.com`, and `player.vimeo.com`, plus the public-page `video` media sources, while keeping `object-src 'none'` and `frame-ancestors 'self'`; a blanket foreign-frame block would regress landing/petition pages.

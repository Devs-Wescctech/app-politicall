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
- Authentication Task 6: complete (commits `7f23bd2..f63bd6c`; fifth independent review approved with no Critical/Important/Minor findings; admin browser auth is cookie-only and generation-safe, impersonation preserves the admin session while issuing an isolated tenant session, privileged pages use asynchronous guards without protected-content flashes, profile password changes require both authoritative admin and tenant sessions, and Locaweb credentials remain server-side; full suite passed with 591 tests and 2 environment-gated skips).
- Authentication Task 7: complete (commits `f63bd6c..6a7ddf8`; third independent review approved with no Critical/Important/Minor findings after two remediation waves; strict v2 keyring encryption, bounded legacy reads, exact secret inventory, transactional dry-run/apply rotation with CAS protection, encrypted/masked webhook secrets, sanitized Google errors, and executable route coverage were validated; PostgreSQL 18 isolated smoke proved dry-run, apply, idempotency, rollback and CAS failure; full suite passed with 610 tests and 2 environment-gated skips).

Completed attendance realtime tasks:
- Attendance Task 1: complete (commits `269d505..5263331`; independent review approved with no Critical/Important/Minor findings; deterministic immutable reconciliation now converges repeated local/server events by ID or non-empty external ID while preserving metadata, canonical server identity, ordering and the existing React Query invalidations; 12 focused/relevant tests and typecheck passed).
- Attendance Task 2: complete (commits `fdfed3f..3c01826`; third independent review approved with no Critical/Important/Minor findings after generation-scoping pre-open/late socket events and aligning the direct zero-based backoff handoff; 18 state-machine tests plus 7 reconciliation tests and typecheck passed, with 355 reachable states checked for incoherence).
- Attendance Task 3: complete (commits `d463e1b..668c1c0`; third independent review approved with no Critical/Important/Minor findings after hardening cookie/session/Origin authentication, exact request targets, bounded async admission and payloads, generation-safe connect/heartbeat deadlines, complete attendance-event reconciliation, idempotent reconnect/cleanup, and a browser-faithful cookie/CSRF smoke; full suite passed with 689 tests and 2 environment-gated skips).
- Attendance Task 4: complete (commits `4aa753c..7ffc6e3`; independent re-review approved with no Critical/Important/Minor findings after fixing the construction-to-start snapshot race; adaptive read-only polling uses 5s detail/10s list during fallback or reconnect, 60s safety polling when connected, and 30s in hidden tabs, with rising-edge recovery invalidation and exact listener cleanup; full suite passed with 702 tests and 2 environment-gated skips).
- Attendance Task 5: complete (commits `b33d28e..daa1627`; independent re-review approved with no Critical/Important/Minor findings after preserving paginated/optimistic detail cache across 50-message refetches, wiring page retry busy state through real reconnecting mode, removing false isolated retry assertions, guarding unmount, and stabilizing the global source/runtime tests; full suite passed with 709 tests and 2 environment-gated skips).

Current task:
- Attendance Realtime Resilience Task 6 is next: local production realtime/browser validation and operator deployment documentation.

Final-review minor triage:
- Registration still persists account, user, and initial session separately. Make this workflow transactional or compensating before release so account/session failures cannot leave orphaned or unretryable partial registration state.
- Login concurrency tests deterministically cover the hash change between issuance and authoritative re-read. Add deterministic coverage for the inverse ordering (password transaction wins before session issuance) for both tenant user and global admin, even though the shared principal advisory lock and transactional broad revocation currently enforce the behavior.
- Browser authentication rate-limit state is process-local. The documented single-app-container deployment is covered; require a shared bounded store before horizontally scaling the app service.
- Remove the `ENABLE_BEARER_AUTH` and `ENABLE_BEARER_EXCHANGE` compatibility paths after the client rollout/smoke window rather than leaving them as permanent dormant code.
- Coverage instrumentation is not installed. Add the Vitest V8 coverage provider and establish reviewed thresholds before the final release gate.

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
- Task 4 CSP must preserve existing embeds with a narrow `frame-src` allowlist for `drive.google.com`, `www.youtube.com`, and `player.vimeo.com`, plus the public-page `video` media sources, while keeping `object-src 'none'` and `frame-ancestors 'self'`; a blanket foreign-frame block would regress landing/petition pages.

# Authentication Task 6 Report

## Scope and commits

- Worktree: `C:\Users\guilherme.pereira\Documents\Politicall-worktrees\production-hardening`
- Branch: `codex/production-hardening`
- Base: `7f23bd213bd43ec060f209dcb96ba1abe75b9f4e`
- RED: `3a6024e7b60c3a4b6c1361bdf5688ea99f042325`
- GREEN: `8687257a32985a2df6335001be38f5a02677db50`
- Review remediation base: `afd9c32fd4e44d76d392cac79688397b373a880e`
- Review RED: `eed13f19ce0993a46a3afa8bb62c821e5910cd56`
- Review GREEN: `cea213a7208fcb05c380d8fe28179d5c0d1b494c`
- Second review remediation base: `ee649835212f50faf344f6f2a4313f45d3fa0ce0`
- Second review RED: `71ddec10e437f1a3f913152e0662a61f9f9a1a56`
- Second review GREEN: `78e1bec7f310726ae97f4dae4a13c52a2f7af576`
- Third review remediation base: `49ccf46eb1b1bd59789314a46025b4a62a33f562`
- Third review RED: `d5cff92046d954d24a79690f878c90771988753b`
- Third review GREEN: `8c32262e6a43fd909646f1ceefd84d5f0ba500c2`

## Delivered behavior

- Added `client/src/lib/admin-session.ts`: cookie-only global-admin state
  (`loading`, `authenticated`, `unauthenticated`), login, probe, admin CSRF,
  one bounded refresh retry, generation-safe same-tab refresh, logout fallback,
  and cache cleanup.
- Generalized the Task 5 refresh coordinator only with a channel-name parameter.
  Tenant remains `politicall-session-refresh`; admin uses isolated
  `politicall-admin-session-refresh`.
- Migrated all specified global-admin callers from browser credentials to
  `adminRequest`, preserving reader API-key documentation and provider settings.
  `/admin` and `/contracts` wait for the admin probe before rendering content.
- Impersonation calls the admin cookie endpoint, receives only the tenant user
  display payload, stores a non-authoritative UI marker, and keeps the global
  admin cookie. Ending the tenant session during impersonation returns to
  `/contracts` without revoking the global-admin session.
- Profile password bypass now requires the independent, active global-admin
  cookie session and an impersonated tenant user with role `admin`. Missing,
  malformed, wrong-kind, revoked, expired, or tenant-scoped admin sessions do
  not qualify. Tenant password changes revoke tenant sessions; global-admin
  password changes clear admin cookies and the UI returns to admin login.
- Added AST source gate coverage for aliases of `admin_token`, `auth_token`,
  `X-Admin-Token`, and first-party Bearer construction across `client/src`.

## Independent review remediation

- `/admin` and `/contracts` keep privileged queries disabled until the admin
  snapshot is `authenticated` and render `null` while loading or
  unauthenticated. The login form waits for its asynchronous probe.
- Failed bootstrap, refresh, login, logout, and request-refresh paths now clear
  all privileged caches and the marker once per generation before publishing
  unauthenticated. Generation-scoped bootstrap/refresh flights prevent stale
  responses and `finally` handlers from affecting a newer login.
- `adminRequest` exposes a non-OK raw `Response` only through explicit
  `returnErrorResponse`; default UI errors remain bounded. FormData preserves
  its native body.
- The extracted profile route uses tenant cookie plus user CSRF middleware,
  target role `admin`, and a separately active global-admin cookie for bypass.
  It clears only tenant cookies after a password change, preserving admin.
- Settings invalidates the tenant client state after a successful password
  change, navigating to `/contracts` for impersonation and `/login` otherwise.
  The marker decides UI navigation only, never server authorization.
- The admin AST gate uses symbol-scoped constant resolution and mutation
  fixtures for aliases, concatenation, casing, object/bracket/dot headers, and
  `Headers.set`/`append`.

## Second independent review remediation

- `adminRequest` now treats 401 and only a 403 with exact
  `Authentication failed` as terminal authentication rejection. It retries
  once, then invalidates/clears before publishing unauthenticated if that
  retry is also rejected; functional 403 responses remain authenticated.
- Refresh owners only perform their refresh request and return a boolean. The
  post-coordinator continuation publishes auth on success or invalidates on
  failure, so a cross-tab owner posts `result:false` before either tab resets
  local coordination. Remote false results also invalidate locally.
- The source gate rejects every executable browser `Authorization` construction
  regardless of token value, including shorthand objects, `Headers` tuples,
  dynamic/helper values, bound mutators, bracket methods, and credential
  storage aliases. Documentation remains non-executable text.
- Contracts and system-sync now accept the bounded default `adminRequest`
  error rather than retaining unreachable non-OK response-body branches.
- The profile bypass re-reads the target and requires its authoritative role to
  still be `admin`, closing a middleware-to-handler role change race.

## Third independent review remediation

- Invalidation is now terminal: it advances the session generation before
  cache cleanup, coordinator reset, and unauthenticated publication. All
  callers and flights from the failed generation become stale; a later login
  starts a distinct generation and its next failure clears caches again.
- The cross-tab owner callback remains request-only. The generation advance
  occurs only after the coordinator has resolved and published its result.
- The AST gate now follows `HeadersInit` through `fetch` and `new Request`,
  array aliases and concatenation, `Map`, and `Object.fromEntries`. The sole
  executable-string exception is the exact Locaweb provider metadata property
  `locawebAuthHeader` in `components/admin/AdminIntegrationsDialog.tsx`.

## TDD evidence

| Stage | Command | Result |
| --- | --- | --- |
| RED | `npm test -- client/src/lib/admin-session.test.ts tests/admin-browser-auth-source.test.ts` | Failed as intended: missing `admin-session` module and 59 legacy credential violations. |
| GREEN | `npm test -- client/src/lib/admin-session.test.ts client/src/lib/session.test.ts client/src/lib/session-coordinator.test.ts tests/admin-browser-auth-source.test.ts server/auth-cookie.test.ts server/routes/auth-session-routes.test.ts` | Passed: 6 files, 59 tests. |
| Full suite | `npm test` | Passed: 75 files, 576 tests; 2 existing environment-gated skips. |
| Typecheck | `npm run check` | Passed. |
| Production build | `npm run build` | Passed; Vite transformed 3,711 modules. |
| Secret scan | `npm run security:secrets` | Passed. |
| Production audit | `npm audit --omit=dev --audit-level=high` | Passed: 0 vulnerabilities. |
| Review RED | `npm test -- client/src/lib/admin-session.test.ts tests/admin-browser-auth-source.test.ts server/routes/profile-route.test.ts` | Failed as intended: missing profile route plus cleanup, response mode, and authenticated-only UI gaps. |
| Review GREEN focused | `npm test -- client/src/lib/admin-session.test.ts tests/admin-browser-auth-source.test.ts server/routes/profile-route.test.ts server/auth-cookie.test.ts` | Passed: 4 files, 24 tests. |
| Review full suite | `npm test` | Passed: 76 files / 583 tests, 2 existing environment-gated skips. |
| Review gates | `npm run check`, `npm run build`, `npm run security:secrets`, `npm audit --omit=dev --audit-level=high`, `git diff --check 7f23bd2..HEAD` | All passed; audit reported 0 vulnerabilities. |
| Second review RED | `npm test -- client/src/lib/admin-session.test.ts tests/admin-browser-auth-source.test.ts server/routes/profile-route.test.ts` | Failed as intended: terminal retry/remote failure did not invalidate, coordinator waited for lease, stale target role bypassed, and AST/callsite mutants were missed. |
| Second review GREEN focused | `npm test -- client/src/lib/admin-session.test.ts tests/admin-browser-auth-source.test.ts server/routes/profile-route.test.ts` | Passed: 3 files, 18 tests. |
| Second review full suite | `npm test` | Passed: 76 files / 588 tests, 2 existing environment-gated skips. |
| Second review gates | `npm run check`, `npm run build`, `npm run security:secrets`, `npm audit --omit=dev --audit-level=high`, `git diff --check 7f23bd2..HEAD` | All passed; audit reported 0 vulnerabilities. |
| Third review RED | `npm test -- client/src/lib/admin-session.test.ts tests/admin-browser-auth-source.test.ts` | Failed as intended: stale request started refresh two after terminal failure and `fetch` HeadersInit authorization was missed. |
| Third review GREEN focused | `npm test -- client/src/lib/admin-session.test.ts tests/admin-browser-auth-source.test.ts` | Passed: 2 files, 18 tests. |
| Third review full suite | `npm test` | Passed: 76 files / 589 tests, 2 existing environment-gated skips. |
| Third review gates | `npm run check`, `npm run build`, `npm run security:secrets`, `npm audit --omit=dev --audit-level=high`, `git diff --check 7f23bd2..HEAD` | All passed; audit reported 0 vulnerabilities. |

The first parallel full-suite run had one timeout in the standalone Docker
compose configuration test while build/check were running concurrently. Its
isolated rerun and the serial full suite both passed; no test timeout was
changed.

## Coverage and residual risk

There is no `test:coverage` script in this repository. Focused tests cover
admin login/probe, neutral privileged rendering, admin CSRF, one retry,
same-tab coordination, generation races, request-failure cleanup, logout
fallback, bounded raw responses, server-side cookie/CSRF/role password bypass,
tenant-cookie revocation with admin-cookie coexistence, terminal retry and
remote coordinator failure cleanup, terminal generation invalidation, and AST
HeadersInit mutation fixtures. No browser E2E or live production/Portainer
session was run. Browsers without
`BroadcastChannel` retain same-tab deduplication but not multi-tab refresh
coordination.

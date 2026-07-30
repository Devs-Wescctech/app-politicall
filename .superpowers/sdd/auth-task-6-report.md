# Authentication Task 6 Report

## Scope and commits

- Worktree: `C:\Users\guilherme.pereira\Documents\Politicall-worktrees\production-hardening`
- Branch: `codex/production-hardening`
- Base: `7f23bd213bd43ec060f209dcb96ba1abe75b9f4e`
- RED: `3a6024e7b60c3a4b6c1361bdf5688ea99f042325`
- GREEN: `8687257a32985a2df6335001be38f5a02677db50`

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

The first parallel full-suite run had one timeout in the standalone Docker
compose configuration test while build/check were running concurrently. Its
isolated rerun and the serial full suite both passed; no test timeout was
changed.

## Coverage and residual risk

There is no `test:coverage` script in this repository. Focused tests cover
admin login/probe, admin CSRF, one retry, same-tab coordination, logout
fallback/cache cleanup, server-side active admin-session structure, Task 5
coordinator regression, cookie CSRF, and the AST source gate. No browser E2E
or live production/Portainer session was run. Browsers without
`BroadcastChannel` retain same-tab deduplication but not multi-tab refresh
coordination.

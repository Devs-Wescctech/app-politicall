# Auth Security Hardening TDD Evidence

## Scope

This evidence covers the final authentication hardening for cookie sessions, CSRF, registration atomicity, Bearer compatibility shutdown, and deployment documentation.

## Acceptance Checks

- Browser credentials are stored in HttpOnly cookies, not in `localStorage` or `sessionStorage`.
- Tenant and admin browser clients do not construct first-party Bearer headers.
- API-key documentation and server-to-server integrations may still use `Bearer pk_*` or explicit external API credentials.
- Public registration commits account, owner user, and initial session through a single transaction.
- Password change races revoke newly issued sessions for tenant and global admin flows.
- Refresh token rotation detects reuse and revokes the session family.
- CSRF rejects mutating authenticated requests without a valid readable cookie/header match.
- Production deployment defaults keep `ENABLE_BEARER_AUTH=false` and `ENABLE_BEARER_EXCHANGE=false`.
- Portainer runbook documents the staged rollout and secret rotation requirements.

## Automated Evidence

Validation completed on 2026-07-30:

- `npm test -- tests/auth-documentation-contract.test.ts server/routes/public-auth-routes.test.ts server/auth-production-config.test.ts`: passed, 3 files / 7 tests.
- `npm test`: passed, 93 test files passed / 2 skipped; 716 tests passed / 2 skipped.
- `npm run check`: passed.
- `npm run build`: passed.
- `npm run security:secrets`: passed.
- `npm audit --omit=dev --audit-level=high`: passed, 0 vulnerabilities.
- `docker-compose config --quiet` with synthetic production variables: passed.
- Disposable PostgreSQL auth/session migration validation: passed via `.superpowers/tmp/auth-task3-pg-validation.ps1`.
- Production smoke harness: passed with migrations first run applied, second run skipped, health/ready/login/html/asset/listener confirmed.
- Data-key rotation smoke harness: passed for dry-run, apply, idempotency, rollback, CAS, and cleanup.
- Attendance cookie/CSRF smoke coverage: covered by `server/attendance-events-cookie.test.ts` in the full `npm test` run.
- Browser QA: passed via `.superpowers/tmp/run-auth-browser-qa.ps1`; final post-build artifact at `.superpowers/artifacts/auth-browser-qa-2026-07-30T16-32-21-163Z/result.json`.

## Browser QA Matrix

The final browser QA pass covered:

- Tenant login, dashboard load, refresh, and logout.
- Global admin login, admin verify, impersonation into a tenant user, and logout.
- Two independent sessions in separate browser contexts.
- CSRF rejection for a mutating authenticated request without the header.
- Mobile login flow at 390 px width.
- Cookie policy for `politicall_access`, `politicall_refresh`, `politicall_csrf`, `politicall_admin_access`, `politicall_admin_refresh`, and `politicall_admin_csrf`.
- No credential values in `localStorage`, `sessionStorage`, URL, DOM text, console output, or first-party response bodies.

Screenshots were captured for tenant dashboard desktop, admin dashboard, two independent tenant contexts, and mobile tenant dashboard. The artifact stores only status, screenshot paths, and cookie attributes, not token values or passwords.

## Production Rollout Decision

Default rollout is cookie-only:

1. Deploy with `ENABLE_BEARER_AUTH=false` and `ENABLE_BEARER_EXCHANGE=false`.
2. Validate login, refresh, logout, impersonation, attendance realtime, and upload/static smoke checks.
3. If old browser sessions must be migrated, enable only `ENABLE_BEARER_EXCHANGE=true` for a short maintenance window.
4. Disable `ENABLE_BEARER_EXCHANGE` after the migration smoke passes.
5. Rotate leaked or historical test secrets before production and before publishing a public release.

## Residual Risk

Real production secret rotation and public Git history purging require operator access to Portainer, GitHub/GHCR, DNS/proxy, and the database. This local validation must not be treated as completion of those operator actions.

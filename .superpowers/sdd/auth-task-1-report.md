# Authentication Task 1 Report

## Scope

Implemented the persistent revocable-session model from `task-1-brief.md`.

Files changed or created:

- `shared/schema.ts`
- `migrations/0010_auth_sessions.sql`
- `server/services/auth-session-store.ts`
- `server/services/auth-session-store.test.ts`
- `server/services/production-migrations.ts`
- `server/services/production-migrations.test.ts`
- `server/services/production-migrations.integration.test.ts`
- `scripts/setup-dev-db.ts`

## Behavior covered

- Refresh tokens are SHA-256 hashed before persistence and raw tokens are absent from stored rows.
- Tenant lookups and mutations are scoped by both `accountId` and `userId`.
- Global-admin sessions require an explicit global-admin principal and do not inherit a tenant.
- Expired and revoked sessions cannot be retrieved for refresh.
- Rotation records forward and backward linkage, revokes the source, and retains a stable family ID.
- Rotation reuse revokes the family inside the same transaction, including the zero-row conditional-update concurrency case.
- Logout revokes one session; password changes revoke all active sessions for the tenant user.
- `auth_sessions` and `legacy_auth_exchanges` contain only SHA-256 token/metadata hashes, fixed-length checks, useful indexes, and additive/idempotent DDL.

## TDD Evidence

| Stage | Command | Result |
|---|---|---|
| RED | `npm test -- server/services/auth-session-store.test.ts` | Failed as expected: `Cannot find module './auth-session-store'`; the store did not exist. |
| GREEN | `npm test -- server/services/auth-session-store.test.ts` | Passed: 7/7 after minimal store/schema implementation. |
| Concurrency RED | `npm test -- server/services/auth-session-store.test.ts` | Failed as expected: a simulated lost conditional rotation update incorrectly returned `rotated`. |
| Concurrency GREEN | `npm test -- server/services/auth-session-store.test.ts` | Passed: 8/8 after treating the zero-row update as reuse and revoking the family. |
| Migration contract | `npm test -- server/services/production-migrations.test.ts server/services/production-migrations.integration.test.ts` | Passed: 8 unit tests; 1 PostgreSQL integration test skipped because `MIGRATION_TEST_DATABASE_URL` is unset locally. |
| Type check | `npm run check` | Passed: `tsc` exit 0. |

The migration contract tests were updated to include `0010_auth_sessions.sql`; transaction/history counts derive from the manifest length so the PostgreSQL CI path expects ten records (baseline plus nine migrations).

## Coverage

`npm test -- server/services/auth-session-store.test.ts --coverage` could not run because the repository does not install `@vitest/coverage-v8`. No dependency was added outside this task.

## Commits

- `53453e3` `test: add revocable session store coverage` (validated initial RED checkpoint)
- The final implementation commit is created with this report and is listed in the task completion response.

## Risks and Follow-up

- The real PostgreSQL migration integration remains intentionally skipped locally without `MIGRATION_TEST_DATABASE_URL`; CI must run it against PostgreSQL 16.
- This task provides the persistence primitives only. Wiring refresh/login/logout HTTP endpoints and consuming `legacy_auth_exchanges` belongs to subsequent hardening tasks.
- No raw refresh tokens, bearer tokens, IP values, or device values are persisted by the new model.

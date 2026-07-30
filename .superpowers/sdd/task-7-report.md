# Release Foundation Task 7 Report

## Scope

- Source brief: `.superpowers/sdd/task-7-brief.md`.
- Plan: `docs/superpowers/plans/2026-07-29-release-foundation.md`, Task 7.
- Deployment contract: `docs/deployment/portainer-production.md`.

## RED

Command run against the prior workflow:

```text
npm test -- tests/deployment-config.test.ts
```

Result: failed as expected with 4 failures and 31 passes.

The failures proved that the old workflow used Node 20, updated npm globally,
left actions unpinned, had no top-level least-privilege permissions or
PostgreSQL 16 migration service, authenticated before scanning, published
before a blocking Trivy scan, and had no Dependabot configuration.

A focused follow-up RED added the explicit `5432:5432` service port required
by the runtime-built `MIGRATION_TEST_DATABASE_URL`; it failed with 1 failure
and 34 passes before the port mapping was added.

## GREEN

The workflow now has `typecheck`, `build`, `security`, and `docker` jobs.
The Docker job waits for all three gates, runs only for pushes to `main`,
builds one local `linux/amd64` SHA-tagged candidate, runs blocking Trivy, then
authenticates and pushes that same local candidate. The resulting digest is
resolved into the GitHub job summary. Pull requests run the gates but cannot
reach the Docker job, registry login, or push.

The build job starts PostgreSQL 16 with a healthcheck, constructs the
integration URL at runtime from an uncredentialed base URL plus the ephemeral
run ID password, and exports only `MIGRATION_TEST_DATABASE_URL`. It does not
fall back to `DATABASE_URL`.

All actions are pinned to reviewed full SHAs, Dependabot updates npm and
GitHub Actions weekly, and no registry or database credentials are committed.

## Validation

| Command | Result |
| --- | --- |
| `npm test -- tests/deployment-config.test.ts` | Passed: 35 tests. |
| `npm run check` | Passed. |
| `npm test` | Passed: 421 tests; 1 integration test skipped without local `MIGRATION_TEST_DATABASE_URL`. |
| `npm run build` | Passed. |
| `npm run security:secrets` | Passed. |
| `npm audit --omit=dev --audit-level=high` | Passed: 0 vulnerabilities. |
| `git diff --check` | Passed. |

## External Risks And Handoff

- No local Docker Engine is available. Docker build, local-image Trivy scan,
  GHCR login, push, and remote digest resolution were not executed locally.
- The PostgreSQL 16 migration integration is structurally configured and will
  run in the GitHub-hosted workflow; it was skipped locally because no
  disposable local integration URL was provided.
- The GitHub workflow requires a repository package policy that permits the
  `GITHUB_TOKEN` to write the GHCR package on pushes to `main`.

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

The workflow now has `typecheck`, `build`, `security`, `docker`, and `publish`
jobs. Pull requests run the quality gates but cannot reach either image job.

The build job starts PostgreSQL 16 with a healthcheck, constructs the
integration URL at runtime from an uncredentialed base URL plus the ephemeral
run ID password, and exports only `MIGRATION_TEST_DATABASE_URL`. It does not
fall back to `DATABASE_URL`.

All actions are pinned to reviewed full SHAs, Dependabot updates npm and
GitHub Actions weekly, and no registry or database credentials are committed.

## Review Correction RED

The review identified that the Docker build and scan shared a job with the
GHCR write credential. Tests were changed first to require a credential-free
`docker` job, artifact checksum handoff, an isolated `publish` job, fail-closed
push digest parsing, and the reviewed PostgreSQL 16 digest.

```text
npm test -- tests/deployment-config.test.ts
```

Result against the reviewed implementation: failed as expected with 4
failures and 32 passes. The missing contracts were the two pinned artifact
actions, the `publish` job, the PostgreSQL digest, and the separated scan and
publication sequence.

A follow-up focused RED added contracts for valid output access and pipeline
failure propagation during `docker load`. It failed with 1 failure and 35
passes on the invalid hyphenated output access; the implementation then
renamed the outputs and added `pipefail`.

## Review Correction GREEN

The `docker` job has only `contents: read`. It builds one local candidate,
runs blocking Trivy, saves that exact tagged image through gzip, computes its
SHA-256, and uploads it for one day without artifact recompression. It has no
registry login, package-write permission, or push command.

The `publish` job has only `packages: write`. It downloads the official
artifact, validates the expected checksum, loads the image, verifies the exact
SHA tag, and only then logs into GHCR and pushes. It parses a 64-hex `sha256`
digest directly from successful `docker push` output and fails if the digest
is absent or malformed. The summary records only `repository@digest`.

PostgreSQL remains major-version 16 and is pinned to the reviewed official
digest recorded on 2026-07-29.

## Validation

| Command | Result |
| --- | --- |
| `npm test -- tests/deployment-config.test.ts` | Passed: 36 tests. |
| `npm run check` | Passed. |
| `npm test` | Passed: 422 tests; 1 integration test skipped without local `MIGRATION_TEST_DATABASE_URL`. |
| `npm run build` | Passed. |
| `npm run security:secrets` | Passed. |
| `npm audit --omit=dev --audit-level=high` | Passed: 0 vulnerabilities. |
| `git diff --check` | Passed. |

## External Risks And Handoff

- No local Docker Engine is available. Docker build, local-image Trivy scan,
  save/load handoff, GHCR login, push, and digest extraction were not executed
  locally.
- The PostgreSQL 16 migration integration is structurally configured and will
  run in the GitHub-hosted workflow; it was skipped locally because no
  disposable local integration URL was provided.
- The GitHub workflow requires a repository package policy that permits the
  `GITHUB_TOKEN` to write the GHCR package on pushes to `main`.
- `actionlint` and Prettier are not installed in this environment, so those
  optional workflow lint/format checks were unavailable. Structural Vitest
  contracts and `git diff --check` passed.

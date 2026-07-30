# Attendance Realtime Resilience Task 4 Report

Base: `4aa753c`

## Delivered

- Added pure typed polling policy for every required realtime mode and tab visibility.
- Added one page-level polling environment lifecycle with idempotent listener setup/cleanup, current `online` and `visibility` snapshots, and recovery invalidation for the broad `['/api/attendance/conversations']` prefix.
- Coalesced a combined offline/hidden recovery into one invalidation. Initial mount and duplicate events do not invalidate.
- Wired typed realtime `mode` and polling `visibility` from `attendance.tsx` to the existing list and open-detail query observers.
- Enabled `refetchIntervalInBackground: true` for both observers and preserved query keys, cached initial detail data, pagination, filters, drafts, scroll behavior, optimistic sends, and manual refresh.
- Removed the automatic `POST /api/attendance/sync` timer so adaptive HTTP polling is read-only. The manual sync button is unchanged.
- Did not modify Task 3 realtime transport or add mutation retries.

## TDD Evidence

| Stage | Commit | Command | Result |
| --- | --- | --- | --- |
| RED | `dee6428` | `npm test -- client/src/lib/attendance-polling.test.ts` | Failed as intended because `./attendance-polling` did not exist. |
| GREEN | `5659b52` | `npm test -- client/src/lib/attendance-polling.test.ts` | Passed: 1 file, 10 tests. |

The executable lifecycle tests cover the interval table, initial hidden/offline state, one listener registration, exact listener cleanup, duplicate events, combined recovery, snapshots, and broad-prefix invalidation.

## Validation

| Gate | Result |
| --- | --- |
| Focused Tasks 1-4 and attendance lane/layout tests | Passed: 9 files, 96 tests. |
| `npm test` | Passed: 89 files, 2 skipped; 699 tests, 2 skipped. |
| `npm run check` | Passed. |
| `npm run build` | Passed. |
| `npm run security:secrets` | Passed. |
| `npm audit --omit=dev --audit-level=high` | Passed: 0 vulnerabilities. |
| `git diff --check 4aa753c..HEAD` | Passed: no whitespace errors. |

## Concerns

- No residual implementation concern identified. The two skipped full-suite tests were pre-existing environment-gated skips.

## Review 1 Remediation

Review contract: `.superpowers/sdd/attendance-task-4-review-1.md`

- `start()` now compares its construction-time snapshot with the recaptured browser state, installs listeners, marks the lifecycle active, and publishes exactly one update only when that snapshot changed.
- Recapture remains free of recovery invalidation, including initial mount and start-after-stop.
- New executable regressions cover the construction-to-start online/visibility race, repeated `start()`, start-after-stop, and a Strict Mode style mount/unmount/remount lifecycle.

| Stage | Commit | Command | Result |
| --- | --- | --- | --- |
| Review 1 RED | `3aec7d7` | `npm test -- client/src/lib/attendance-polling.test.ts` | Failed as intended: the recaptured `offline/hidden` snapshot did not notify the subscriber. |
| Review 1 GREEN | `9b73eb8` | `npm test -- client/src/lib/attendance-polling.test.ts` | Passed: 1 file, 13 tests. |

### Review 1 Validation

| Gate | Result |
| --- | --- |
| Focused Tasks 1-4 and attendance lane/layout tests | Passed: 9 files, 99 tests. |
| `npm test` | Passed: 89 files, 2 skipped; 702 tests, 2 skipped. |
| `npm run check` | Passed. |
| `npm run build` | Passed. |
| `npm run security:secrets` | Passed. |
| `npm audit --omit=dev --audit-level=high` | Passed: 0 vulnerabilities. |

## Review Status

Review 1 remediation is implemented and awaiting re-review. This report does not mark Task 4 approved.

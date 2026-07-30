# Attendance Realtime Resilience Task 5 Report

Status: APPROVED

Base: `b33d28e`

## Delivered

- Added a compact, persistent page-level `ConnectionStatus` for connected,
  reconnecting, and fallback realtime modes.
- Added a compact HTTP refresh failure row directly below the open chat header.
  The error takes precedence over the realtime label and disappears after the
  detail query recovers.
- Retry uses the existing realtime reconnect action. The failed detail retry
  calls only `reconnectNow()` and the existing read-only query `refetch()`; it
  does not send messages, clear cached data, change drafts, remount the
  conversation, or alter polling.
- Used the existing `Badge`, `Button`, `cn`, and Lucide icons. The status has a
  polite, atomic `role="status"` live region; icons are decorative; and retry
  is a native labelled button with disabled and `aria-busy` behavior.
- Added exactly the allowed test dependencies: `@testing-library/react@16.3.2`,
  `@testing-library/user-event@14.6.1`, and `jsdom@30.0.1`.

## TDD Evidence

| Stage | Commit | Command | Result |
| --- | --- | --- | --- |
| RED | `ce0520a` | `npm test -- client/src/components/attendance/connection-status.test.ts` | Failed as intended because `./ConnectionStatus` did not exist. |
| GREEN | `b96c5d4` | `npm test -- client/src/components/attendance/connection-status.test.ts` | Passed: 1 file, 4 tests. |

The jsdom component tests use accessible role/name queries and cover all four
labels, the one persistent live region across mode rerenders, HTTP error
precedence, retry visibility, keyboard activation, busy duplicate prevention,
and the chat read-retry callback preserving representative messages and draft
values without sending.

## Review Remediation

Independent review requested changes for three Important issues and one Minor
issue. Remediation commit `8e496ac` addresses them:

- Added `client/src/lib/attendance-detail-cache.ts` and a real
  `QueryClient`/`QueryObserver` regression test so a normal conversation detail
  refetch merges the newest 50 messages into the existing detail cache instead
  of replacing loaded history or optimistic messages.
- Updated `ChatPanel` to use the detail-cache query function for the existing
  read-only detail fetch.
- Replaced the false isolated retry-preservation test with tests that verify
  the retry only calls `reconnectNow()` and `refetch()`.
- Covered the page retry busy state through the actual `reconnecting` mode and
  verified a later fallback releases the button for another retry.
- Guarded the local retry state against updates after component unmount.

Remediation verification:

| Gate | Result |
| --- | --- |
| `npm test -- --run client/src/lib/attendance-detail-cache.test.ts client/src/components/attendance/connection-status.test.ts` | Passed: 2 files, 6 tests. |
| `npm run check` | Passed. |
| `npm test -- --run client/src/lib/attendance-detail-cache.test.ts client/src/lib/attendance-reconciliation.test.ts client/src/components/attendance/connection-status.test.ts client/src/lib/attendance-realtime-controller.test.ts client/src/lib/attendance-polling.test.ts` | Passed: 4 files, 26 tests. |

Second re-review found the page-level retry busy state was still only present
in the component test harness. Commit `5fe836a` wired
`retryInProgress={mode === "reconnecting"}` into the real `AttendancePage`,
added a regression guard for that page wiring, optimized the global admin
browser credential source scan to use one TypeScript program for the client
tree, and gave the runtime startup probe/source scan explicit time budgets so
the full suite remains stable under load without relaxing assertions.

Second remediation verification:

| Gate | Result |
| --- | --- |
| `npm test -- --run client/src/pages/attendance-new-conversation-layout.test.ts client/src/components/attendance/connection-status.test.ts client/src/lib/attendance-detail-cache.test.ts` | Passed: 3 files, 8 tests. |
| `npm run check` | Passed. |
| `npm test` | Passed: 91 files, 2 skipped; 709 tests, 2 skipped. |

## Validation

| Gate | Result |
| --- | --- |
| Focused Tasks 1-5 and attendance layout tests | Passed: 6 files, 59 tests. |
| `npm test` | Passed after second remediation: 91 files, 2 skipped; 709 tests, 2 skipped. |
| `npm run check` | Passed. |
| `npm run build` | Passed. |
| `npm run security:secrets` | Passed. |
| `npm audit --omit=dev --audit-level=high` | Passed: 0 vulnerabilities. |
| `git diff --check b33d28e..HEAD` | Passed before this evidence commit; repeated after the commit below. |

## Concerns

- The first full-suite run was concurrent with the production build and timed
  out after five seconds in a pre-existing global source scan. The same suite
  passed unchanged when rerun in isolation.
- No production deployment, Git remote operation, Portainer operation, server,
  or polling/transport behavior was started or changed.

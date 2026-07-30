# Attendance Realtime Task 2 - Review 1

Verdict: CHANGES_REQUIRED

Head reviewed: `a9b0948`

## Important findings

1. A socket close before `open` is currently ignored. This is the expected
   production behavior when a proxy rejects the upgrade. The reducer must enter
   fallback, advance the reconnect attempt, and permit exponential backoff even
   when no `socket.open` event occurred.
2. Socket events are not scoped to a connection generation. A late healthy,
   close, or heartbeat-failure event from a superseded socket can mutate the
   active socket and satisfy the two-confirmation rule early. Add a monotonically
   increasing connection generation/identifier to state and relevant events;
   only the active generation may open, confirm health, close, or fail.

## Required regressions

- Initial attempt closes before open and activates fallback at attempt one.
- Repeated pre-open failures advance bounded backoff attempts.
- Starting a replacement attempt invalidates every event from the old
  generation.
- Late old-generation healthy confirmations cannot contribute to the current
  two-confirmation count.
- Late old-generation close/heartbeat failure cannot clear or downgrade the
  current socket.
- Current-generation close before and after open remains effective.
- Manual reset and offline/online transitions invalidate prior generations.

## Fix contract

- Follow RED/GREEN TDD and append exact evidence to
  `.superpowers/sdd/attendance-task-2-report.md`.
- Keep the module pure and DOM-free.
- Run focused Task 2 tests, Task 1 reconciliation tests, typecheck and diff
  check.
- Commit the review contract plus fixes and leave status awaiting re-review.

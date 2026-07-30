# Attendance Realtime Task 2 - Review 2

Verdict: CHANGES_REQUIRED

Head reviewed: `44c5cd6`

## Important finding

The reducer stores `reconnectAttempt = 1` after the first failure, while
`nextReconnectDelay` accepts a zero-based attempt. Passing state directly skips
the required 1,000 ms base delay and starts at 2,000 ms.

## Binding resolution

Make the state-to-delay handoff direct and unambiguous:

- `reconnectAttempt` is `null` before any failed connection and after a
  successful open/manual reset.
- The first current-generation close or heartbeat failure stores attempt `0`.
- Each consecutive current-generation failure increments it to `1`, `2`, and so
  on.
- Starting the replacement connection does not increment the attempt.
- Task 3 must be able to call
  `nextReconnectDelay(state.reconnectAttempt ?? 0, random)` without subtracting
  or reading previous reducer state.
- At jitter sample `0.5`, the first three waits are 1,000 ms, 2,000 ms, and
  4,000 ms. The final result remains capped at 30,000 ms.
- Generation safety and every Review 1 fix must remain intact.

This supersedes Review 1's phrase that the first failure stores attempt one;
that wording described a failure count and conflicted with the plan's
zero-based backoff contract.

## Fix contract

- Add a RED integration-style state/delay test, implement GREEN, append evidence
  to the Task 2 report, and rerun Task 2, Task 1, typecheck and diff check.
- Keep the module pure and leave approval to independent re-review.

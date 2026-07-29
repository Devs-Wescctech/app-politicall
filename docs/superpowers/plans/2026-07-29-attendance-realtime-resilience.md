# Attendance Realtime Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep attendance synchronized when production Nginx blocks WebSocket upgrades, while automatically returning to WebSocket when it becomes available.

**Architecture:** A pure connection state machine controls WebSocket retries and adaptive HTTP polling. React Query remains the source of server state; realtime events and polling use one reconciliation helper so duplicate packets converge on one message.

**Tech Stack:** React 18, React Query 5, browser WebSocket/online/visibility APIs, Express WebSocket server, Vitest.

## Global Constraints

- HTTP fallback never retries outbound message sends.
- Conversation polling is 5 seconds when fallback is active; list polling is 10 seconds; hidden tabs use 30 seconds.
- WebSocket uses same-origin cookies and never carries credentials in its URL.
- Every timer, event listener and socket is cleaned up on unmount/logout.
- Repeated HTTP and WebSocket messages converge by local ID or external message ID.
- No Nginx, DNS or host configuration is changed by the code.

---

### Task 1: Extract message reconciliation

**Files:**
- Create: `client/src/lib/attendance-reconciliation.ts`
- Create: `client/src/lib/attendance-reconciliation.test.ts`
- Modify: `client/src/hooks/use-attendance-realtime.ts`

**Interfaces:**
- Produces: `mergeAttendanceMessages(current, incoming)` and `applyAttendanceRealtimeEvent(queryClient, event)`.

- [ ] **Step 1: Write RED tests**

Cover duplicate local ID, duplicate external ID, missing external ID, timestamp order and updated delivery status.

- [ ] **Step 2: Verify RED**

Run: `npm test -- client/src/lib/attendance-reconciliation.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement pure reconciliation**

Use local `id` first and `externalMessageId` second. Merge newer status/metadata into the existing item and sort by normalized timestamp plus ID.

- [ ] **Step 4: Integrate and verify GREEN**

Run the RED command and expect PASS.

- [ ] **Step 5: Commit**

Commit: `refactor: centralize attendance message reconciliation`

### Task 2: Build the connection state machine

**Files:**
- Create: `client/src/lib/attendance-connection-state.ts`
- Create: `client/src/lib/attendance-connection-state.test.ts`

**Interfaces:**
- Produces: `AttendanceConnectionState`, `attendanceConnectionReducer`, `nextReconnectDelay`.

- [ ] **Step 1: Write RED tests**

Cover connecting, connected, reconnecting, fallback, offline, hidden tab, exponential
backoff with bounded jitter, two stable WebSocket opens before relaxing HTTP polling,
and successful recovery.

- [ ] **Step 2: Verify RED**

Run: `npm test -- client/src/lib/attendance-connection-state.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement reducer**

Expose UI states `connected`, `reconnecting`, and `fallback`. Keep internal `offline` and visibility flags. Cap reconnect delay at 30 seconds.

- [ ] **Step 4: Verify GREEN and commit**

Run the RED command and expect PASS.

Commit: `feat: add attendance connection state machine`

### Task 3: Replace tokenized WebSocket with resilient cookie transport

**Files:**
- Modify: `client/src/hooks/use-attendance-realtime.ts`
- Create: `client/src/hooks/use-attendance-realtime.test.ts`
- Modify: `server/attendance-events.ts`
- Create: `server/attendance-events-cookie.test.ts`

**Interfaces:**
- Produces: `useAttendanceRealtime(enabled)` returning `{ mode, isConnected, reconnectNow }`.

- [ ] **Step 1: Write RED tests**

Assert URL has no query token, online/visibility listeners are registered once, cleanup
closes socket/timers, close activates fallback, open resets backoff, heartbeat timeout
closes a stale connection, the server emits a connection identifier, and the server
authenticates from `politicall_access`.

- [ ] **Step 2: Verify RED**

Run: `npm test -- client/src/hooks/use-attendance-realtime.test.ts server/attendance-events-cookie.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement client hook**

Construct:

```ts
function realtimeUrl(): string {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/api/attendance/realtime`;
}
```

Use the state machine, jittered retries, online and visibility events, heartbeat
tracking, and the reconciliation helper. Preserve the current draft and selected
conversation across transport transitions.

- [ ] **Step 4: Implement server cookie auth**

Parse the access cookie, verify it with the shared auth primitive, load the current user and preserve account isolation. Reject query-string credentials.

- [ ] **Step 5: Verify GREEN and commit**

Run the RED command and expect PASS.

Commit: `feat: make attendance realtime cookie based and resilient`

### Task 4: Make polling adaptive

**Files:**
- Modify: `client/src/pages/attendance.tsx`
- Modify: `client/src/components/attendance/ConversationList.tsx`
- Modify: `client/src/components/attendance/ChatPanel.tsx`
- Create: `client/src/lib/attendance-polling.ts`
- Create: `client/src/lib/attendance-polling.test.ts`

**Interfaces:**
- Consumes: Realtime mode.
- Produces: `conversationPollingInterval(mode, visibility)` and `listPollingInterval(mode, visibility)`.

- [ ] **Step 1: Write RED interval tests**

Expected values:

```ts
expect(conversationPollingInterval("fallback", "visible")).toBe(5_000);
expect(listPollingInterval("fallback", "visible")).toBe(10_000);
expect(conversationPollingInterval("fallback", "hidden")).toBe(30_000);
expect(conversationPollingInterval("connected", "visible")).toBe(60_000);
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- client/src/lib/attendance-polling.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement and wire intervals**

Pass realtime mode from `attendance.tsx` into the list/chat components. Replace fixed 3/10-second intervals with the pure policy and trigger immediate invalidation on online/visible transitions.

- [ ] **Step 4: Verify GREEN and commit**

Run the RED test plus existing attendance component tests and expect PASS.

Commit: `feat: add adaptive attendance polling fallback`

### Task 5: Add compact connection feedback

**Files:**
- Create: `client/src/components/attendance/ConnectionStatus.tsx`
- Create: `client/src/components/attendance/connection-status.test.ts`
- Modify: `client/src/pages/attendance.tsx`
- Modify: `client/src/components/attendance/ChatPanel.tsx`

**Interfaces:**
- Consumes: Public realtime mode.
- Produces: Accessible status text and retry action without blocking chat.

- [ ] **Step 1: Write RED component tests**

Assert `Conectado`, `Reconectando`, and `Sincronizacao automatica`; retry is shown only
while fallback/reconnecting; status uses `aria-live="polite"`. Verify an HTTP refresh
failure exposes retry without clearing messages or drafts and without resending an
outbound message.

- [ ] **Step 2: Verify RED**

Run: `npm test -- client/src/components/attendance/connection-status.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement compact component**

Use existing design-system Badge/Button and Lucide icons. Keep dimensions stable and do not add a card or modal.

- [ ] **Step 4: Verify GREEN and commit**

Run the RED command and expect PASS.

Commit: `feat: show attendance connection status`

### Task 6: Validate production fallback and document proxy handoff

**Files:**
- Create: `docs/testing/attendance-realtime-resilience.tdd.md`
- Modify: `docs/deployment/nginx-websocket.conf`
- Modify: `docs/deployment/portainer-production.md`

**Interfaces:**
- Consumes: Full implementation and current production behavior.
- Produces: Evidence that attendance works with WebSocket blocked.

- [ ] **Step 1: Run full gates**

Run TypeScript, full Vitest suite, build and production audit.

- [ ] **Step 2: Run Browser QA with WebSocket blocked**

Block `/api/attendance/realtime`, verify fallback label, list refresh, open-chat refresh, navigation cleanup, offline/online recovery and mobile layout. Do not send a real message.

- [ ] **Step 3: Run Browser QA with WebSocket allowed locally**

Verify connected state, event reconciliation and 60-second safety polling.

- [ ] **Step 4: Document evidence and Nginx handoff**

Record actual results and the external Nginx change required for `101 Switching Protocols`.

- [ ] **Step 5: Commit**

Commit: `docs: record attendance realtime resilience evidence`

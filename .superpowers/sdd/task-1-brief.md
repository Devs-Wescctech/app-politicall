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

# Meta 24-Hour Window and Unified Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify WhatsApp Cloud conversations correctly, enforce Meta's 24-hour customer-service window, and add a `/` menu combining approved templates and quick replies.

**Architecture:** Put provider classification and window calculation in a dependency-free shared module used by server and client. The server remains authoritative: inbound synchronization updates customer activity and public text sends outside the window return HTTP 409. `ChatPanel` consumes the normalized state, lists connection-scoped templates, and renders one command palette for templates and quick replies.

**Tech Stack:** TypeScript 5.6, Express, React 18, TanStack Query, Vitest, Radix UI, Meta Graph/WHU adapters already present.

## Global Constraints

- Apply the block only to WhatsApp Cloud/API Oficial conversations.
- Use the most recent inbound customer message, never outbound activity, to open the 24-hour window.
- Keep internal notes available when the public window is closed.
- Never expose or log channel tokens.
- Outside the window, templates are enabled and quick replies remain visible but disabled.
- Graphify is unavailable and no `graphify-out` graph exists; use focused source reads only.

---

### Task 1: Shared channel classification and Meta window state

**Files:**
- Create: `shared/attendance-meta-window.ts`
- Create: `shared/attendance-meta-window.test.ts`
- Modify: `client/src/components/attendance/ConversationList.tsx`
- Modify: `client/src/pages/attendance.tsx`

**Interfaces:**
- Produces: `isOfficialAttendanceChannel(input): boolean`.
- Produces: `getMetaWindowState(input, now?): { official: boolean; expired: boolean; lastCustomerActivityAt: string | Date | null; expiresAt: string | null }`.
- Consumes connection `provider`, `channel`, and `metadata`, plus conversation remote metadata. WHU channel type mapping is `1=WHATSAPP`, `2=FACEBOOK_INSTAGRAM`, `3=WACLOUD`; `0` is a filter value and must not mean official.

- [ ] **Step 1: Write failing tests** covering provider `meta_cloud`, metadata `apiType=official`, remote `channelType=3`, remote `channelType=1`, and the previous incorrect `channelType=0` case. Add window tests for 23h59m, 24h, no inbound timestamp, and a non-official channel.
- [ ] **Step 2: Run RED** with `npm.cmd test -- shared/attendance-meta-window.test.ts`; expect missing-module failure.
- [ ] **Step 3: Implement minimal pure helpers** and replace duplicated client-side official checks. Use `>= 24 * 60 * 60 * 1000` for expiration and the safe closed state when an official conversation has no customer timestamp.
- [ ] **Step 4: Run GREEN** with the same command; expect all new tests to pass.

### Task 2: Persist inbound activity and enforce the server boundary

**Files:**
- Modify: `server/attendance-routes.ts`
- Create: `server/services/attendance-meta-policy.ts`
- Create: `server/services/attendance-meta-policy.test.ts`

**Interfaces:**
- Consumes: shared `isOfficialAttendanceChannel` and `getMetaWindowState`.
- Produces: `evaluatePublicReplyPolicy({ conversation, connection, now }): { allowed: boolean; code?: "META_WINDOW_EXPIRED"; metaWindow: ... }`.
- API change: `GET /api/attendance/conversations/:id` returns `metaWindow` and refreshed conversation values after synchronization.
- API change: `POST /api/attendance/conversations/:id/send` returns HTTP 409 `{ error, code: "META_WINDOW_EXPIRED", metaWindow }` for an expired official public reply.

- [ ] **Step 1: Write failing policy tests** for official expired/open, WHU normal, and internal-note bypass.
- [ ] **Step 2: Run RED** with `npm.cmd test -- server/services/attendance-meta-policy.test.ts`; expect missing-module failure.
- [ ] **Step 3: Implement the policy** without database or network dependencies.
- [ ] **Step 4: Update synchronization** so the newest local/remote inbound message sets `lastCustomerActivityAt`; outbound messages only update `lastOperatorActivityAt` and `lastMessageAt`.
- [ ] **Step 5: Refresh the conversation after sync** before returning its detail, attach `metaWindow`, and load its connection safely.
- [ ] **Step 6: Enforce the policy before provider send** in the public `/send` branch. Do not apply it to `isWhisper=true` or `/send-template`.
- [ ] **Step 7: Run GREEN** and then `npm.cmd run check`.

### Task 3: Correct connection setup and provider display

**Files:**
- Modify: `server/routes.ts`
- Modify: `server/attendance-routes.ts`
- Modify: `client/src/components/attendance/SettingsTab.tsx`
- Modify: `client/src/components/attendance/ConversationList.tsx`

**Interfaces:**
- Connection type values: `wescctech` for normal WHU and `meta_cloud` for WhatsApp Cloud.
- Official metadata: `{ apiType: "official", official: true, phoneNumberId, businessAccountId }`.

- [ ] **Step 1: Add failing classification coverage** proving `meta_cloud` is official and `wescctech` is not unless remote channel type is `3`.
- [ ] **Step 2: Correct omni synchronization** so integrations containing both `whatsappPhoneNumberId` and `whatsappBusinessAccountId` create/update a `meta_cloud` connection; WHU token-only integrations remain `wescctech`.
- [ ] **Step 3: Add connection type selector** to attendance settings with explicit `WhatsApp / WHU` and `WhatsApp Cloud / Meta` choices. Show WABA ID and Phone Number ID fields only for Cloud and preserve metadata on edit.
- [ ] **Step 4: Make connection testing provider-aware**: WHU calls channel status; Cloud validates required IDs and calls the Graph templates endpoint, reporting a sanitized error.
- [ ] **Step 5: Correct the channel icon rule** from remote type `0` to remote type `3` and render Cloud blue, WHU green.
- [ ] **Step 6: Run focused tests and TypeScript check**.

### Task 4: Unified `/` command menu and template sending

**Files:**
- Create: `shared/attendance-composer.ts`
- Create: `shared/attendance-composer.test.ts`
- Modify: `client/src/components/attendance/ChatPanel.tsx`

**Interfaces:**
- Produces: `buildComposerCommands({ templates, quickReplies, windowExpired, search })` returning discriminated items `{ kind: "template" | "quick_reply", id, title, preview, disabled, disabledReason }`.
- Consumes: `/api/attendance/templates?connectionId=<id>` and `/api/attendance/quick-replies`.
- Sends templates via `POST /api/attendance/conversations/:id/send-template`.

- [ ] **Step 1: Write failing command-builder tests** for mixed ordering, type labels, search, and disabling quick replies outside the window.
- [ ] **Step 2: Run RED** with `npm.cmd test -- shared/attendance-composer.test.ts`; expect missing-module failure.
- [ ] **Step 3: Implement the pure command builder** and run GREEN.
- [ ] **Step 4: Query connection-scoped templates in `ChatPanel`** using one complete URL in the query key.
- [ ] **Step 5: Open the palette** when the public textarea value begins with `/` or the lightning button is clicked. Render `Template` and `Resposta rápida` badges.
- [ ] **Step 6: Implement selection**: quick reply replaces textarea text; template invokes the existing send-template API and refreshes messages.
- [ ] **Step 7: Render expired-window warning and block** public textarea/send while preserving internal notes. The warning button opens the palette filtered to templates.
- [ ] **Step 8: Handle 409** by displaying the warning state and removing any optimistic public message.
- [ ] **Step 9: Run TypeScript check**.

### Task 5: End-to-end verification and contract documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-07-13-meta-24h-template-composer-design.md` only if runtime findings require a clarified contract.

- [ ] **Step 1: Run all tests** with `npm.cmd test`; expect zero failures.
- [ ] **Step 2: Run `npm.cmd run check` and `npm.cmd run build`**; expect exit code 0.
- [ ] **Step 3: Restart the local server** and verify `/api/health` returns `{ "status": "ok" }`.
- [ ] **Step 4: Browser validation** on an official conversation older than 24 hours: verify blue Cloud identity, warning, blocked public send, enabled internal note, and templates in `/`.
- [ ] **Step 5: Browser validation** on a WHU conversation: verify green identity, no Meta block, and mixed command menu.
- [ ] **Step 6: Do not send a real template without explicit confirmation**; stop at the enabled selection/send action for external-side-effect safety.


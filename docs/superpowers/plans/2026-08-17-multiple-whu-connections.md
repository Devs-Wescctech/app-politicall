# Multiple WHU Connections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support multiple WHU WhatsApp numbers per account, receiving concurrently and routing every reply through the originating token while requiring sender selection for new conversations and campaigns.

**Architecture:** Make `channel_connections` the canonical source of WHU credentials and add normalized identity fields for safe uniqueness. Bind inbound and outbound attendance traffic to `connectionId`, preserve a temporary legacy integration fallback, and reuse the existing connection selectors in Attendance and Campaigns.

**Tech Stack:** TypeScript 5.6, Node.js 24, Express 4, PostgreSQL, Drizzle ORM/Zod, React 18, TanStack Query, Vitest, Playwright.

## Global Constraints

- One WHU token represents exactly one WhatsApp number.
- All active WHU numbers receive conversations concurrently.
- Replies always use the token of the connection that received the conversation.
- Operator-initiated conversations and WhatsApp campaigns require explicit sender-number selection.
- Tokens remain encrypted, masked, tenant-scoped, and absent from logs and API responses.
- Existing integration, conversation, campaign, and message data must be preserved.
- The migration must be additive, idempotent, and rollback-compatible.
- Do not publish or deploy this change; validate it only in the local environment.
- Do not include unrelated dirty-worktree changes in feature commits.

## File Map

- `migrations/0019_multiple_whu_connections.sql`: additive identity columns and partial uniqueness indexes.
- `shared/schema.ts`: Drizzle columns and stricter connection input schema.
- `server/services/whu-connection-identity.ts`: phone normalization, token fingerprinting, provider/type guards, and eligibility rules.
- `server/services/whu-connection-identity.test.ts`: pure domain tests.
- `server/services/data-key-rotation.ts`: recompute WHU fingerprints when token envelopes are rotated.
- `server/services/data-key-rotation.test.ts`: key-rotation fingerprint regression coverage.
- `server/services/data-secret-fields.ts`: masked token preservation plus safe response metadata.
- `server/services/channel-connection-service.ts`: create/update/disable validation and duplicate handling.
- `server/services/channel-connection-service.test.ts`: service behavior with repository fakes.
- `server/storage.ts`: connection-aware conversation lookup, usage detection, and duplicate lookup methods.
- `server/attendance-routes.ts`: canonical connection APIs, strict inbound/outbound routing, and lifecycle behavior.
- `server/services/attendance-connection-routing.ts`: pure routing/eligibility decisions shared by routes.
- `server/services/attendance-connection-routing.test.ts`: routing regression tests.
- `server/services/campaign-whatsapp-connections.ts`: connected WHU sender eligibility and safe labels.
- `server/services/campaign-whatsapp-connections.test.ts`: campaign selection regressions.
- `server/routes.ts`: legacy integration migration and campaign endpoint enforcement.
- `server/services/whatsapp-connection-config.ts`: deterministic legacy-to-connection mapping.
- `server/services/whatsapp-connection-config.test.ts`: idempotent legacy mapping coverage.
- `client/src/components/attendance/SettingsTab.tsx`: multi-number management UI.
- `client/src/components/attendance/whu-connection-form.ts`: form model, validation, and payload builder.
- `client/src/components/attendance/whu-connection-form.test.ts`: frontend validation tests.
- `client/src/pages/attendance.tsx`: mandatory sender selection for new conversations.
- `client/src/components/attendance/ConversationList.tsx`: inbound-number identity in the list.
- `client/src/components/attendance/ChatPanel.tsx`: fixed reply-number identity in the chat header.
- `client/src/components/campaign-wizard.tsx`: mandatory connected sender selection and preserved campaign configuration.
- `client/src/pages/settings.tsx`: remove the independent single-token editing path and point to canonical connections.
- `tests/e2e/critical-flows.spec.ts`: browser regressions for connection management and sender selection.
- `docs/api/attendance-whu-connections.md`: request/response contracts and errors.
- `docs/ATENDIMENTO_OMNICHANNEL.md`: operational behavior and local validation notes.

---

### Task 1: WHU Connection Identity and Database Constraints

**Files:**
- Create: `migrations/0019_multiple_whu_connections.sql`
- Modify: `shared/schema.ts`
- Create: `server/services/whu-connection-identity.ts`
- Test: `server/services/whu-connection-identity.test.ts`
- Modify: `server/services/data-key-rotation.ts`
- Modify: `server/services/data-key-rotation.test.ts`

**Interfaces:**
- Produces: `normalizeWhuPhone(value: unknown): string | null`
- Produces: `fingerprintWhuToken(token: string): string`
- Produces: `isWhuConnection(connection: ConnectionLike): boolean`
- Produces: `isConnectionAvailableForSend(connection: ConnectionLike): boolean`

- [ ] **Step 1: Write failing identity tests**

```ts
import { describe, expect, it } from "vitest";
import { fingerprintWhuToken, isConnectionAvailableForSend, normalizeWhuPhone } from "./whu-connection-identity";

describe("WHU connection identity", () => {
  it("normalizes Brazilian numbers for same-account uniqueness", () => {
    expect(normalizeWhuPhone("+55 (51) 99999-0000")).toBe("5551999990000");
    expect(normalizeWhuPhone("  ")).toBeNull();
  });

  it("creates stable non-plaintext token fingerprints", () => {
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    const first = fingerprintWhuToken("token-a");
    expect(first).toBe(fingerprintWhuToken("token-a"));
    expect(first).not.toContain("token-a");
    expect(first).not.toBe(fingerprintWhuToken("token-b"));
  });

  it("allows sends only through connected, non-disabled WHU connections", () => {
    expect(isConnectionAvailableForSend({ channel: "whatsapp", provider: "wescctech", status: "connected" })).toBe(true);
    expect(isConnectionAvailableForSend({ channel: "whatsapp", provider: "wescctech", status: "error" })).toBe(false);
    expect(isConnectionAvailableForSend({ channel: "sms", provider: "wescctech", status: "connected" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run server/services/whu-connection-identity.test.ts`

Expected: FAIL because `whu-connection-identity.ts` does not exist.

- [ ] **Step 3: Implement identity helpers**

```ts
import crypto from "node:crypto";

type ConnectionLike = { channel?: unknown; provider?: unknown; status?: unknown };

export function normalizeWhuPhone(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits || null;
}

export function fingerprintWhuToken(token: string): string {
  const source = process.env.DATA_ENCRYPTION_KEY;
  if (!source) throw new Error("DATA_ENCRYPTION_KEY is required");
  const key = crypto.createHash("sha256").update(`whu-token-fingerprint:${source}`).digest();
  return crypto.createHmac("sha256", key).update(token.trim(), "utf8").digest("hex");
}

export function isWhuConnection(connection: ConnectionLike): boolean {
  return String(connection.channel ?? "").toLowerCase() === "whatsapp"
    && String(connection.provider ?? "").toLowerCase() === "wescctech";
}

export function isConnectionAvailableForSend(connection: ConnectionLike): boolean {
  return isWhuConnection(connection) && String(connection.status ?? "").toLowerCase() === "connected";
}
```

- [ ] **Step 4: Add additive columns and indexes**

Add to `channelConnections` in `shared/schema.ts`:

```ts
phoneNumber: text("phone_number"),
tokenFingerprint: text("token_fingerprint"),
```

Create `migrations/0019_multiple_whu_connections.sql`:

```sql
ALTER TABLE channel_connections ADD COLUMN IF NOT EXISTS phone_number text;
ALTER TABLE channel_connections ADD COLUMN IF NOT EXISTS token_fingerprint text;

UPDATE channel_connections
SET phone_number = regexp_replace(COALESCE(metadata->>'phoneNumber', ''), '[^0-9]', '', 'g')
WHERE phone_number IS NULL AND COALESCE(metadata->>'phoneNumber', '') <> '';

CREATE UNIQUE INDEX IF NOT EXISTS channel_connections_account_phone_active_uidx
ON channel_connections (account_id, phone_number)
WHERE phone_number IS NOT NULL AND status <> 'disabled' AND channel = 'whatsapp' AND provider = 'wescctech';

CREATE UNIQUE INDEX IF NOT EXISTS channel_connections_account_token_active_uidx
ON channel_connections (account_id, token_fingerprint)
WHERE token_fingerprint IS NOT NULL AND status <> 'disabled' AND channel = 'whatsapp' AND provider = 'wescctech';
```

- [ ] **Step 5: Run identity tests and type-check the schema**

Extend the existing channel-token rotation branch so the plaintext token that is already decrypted for re-encryption also produces the active-key fingerprint:

```ts
if (row.table === "channel_connections" && row.field === "token") {
  await tx.execute(sql`
    UPDATE channel_connections
    SET token = ${rotatedEnvelope}, token_fingerprint = ${fingerprintWhuToken(plaintext)}, updated_at = now()
    WHERE id = ${row.id} AND token = ${row.originalValue}
  `);
}
```

Add a rotation test asserting that dry-run changes neither value, apply changes both the envelope and fingerprint, and a second apply reports zero updates.

Run: `npx vitest run server/services/whu-connection-identity.test.ts server/services/data-key-rotation.test.ts && npm run check`

Expected: tests PASS and TypeScript exits with code 0.

- [ ] **Step 6: Commit only Task 1 files**

```bash
git add migrations/0019_multiple_whu_connections.sql shared/schema.ts server/services/whu-connection-identity.ts server/services/whu-connection-identity.test.ts server/services/data-key-rotation.ts server/services/data-key-rotation.test.ts
git commit -m "feat: add WHU connection identity constraints"
```

---

### Task 2: Canonical Connection Lifecycle Service

**Files:**
- Create: `server/services/channel-connection-service.ts`
- Test: `server/services/channel-connection-service.test.ts`
- Modify: `server/services/data-secret-fields.ts`
- Modify: `server/services/data-secret-fields.test.ts`
- Modify: `server/storage.ts`
- Modify: `server/attendance-routes.ts`

**Interfaces:**
- Consumes: `normalizeWhuPhone`, `fingerprintWhuToken`, `isWhuConnection`
- Produces: `buildWhuConnectionCreate(input, accountId): PreparedWhuConnection`
- Produces: `buildWhuConnectionUpdate(input, existing): PreparedWhuConnectionUpdate`
- Produces storage methods `findActiveChannelConnectionByPhone`, `findActiveChannelConnectionByTokenFingerprint`, and `channelConnectionHasHistory`

- [ ] **Step 1: Write failing lifecycle tests**

```ts
import { describe, expect, it } from "vitest";
import { buildWhuConnectionCreate, buildWhuConnectionUpdate } from "./channel-connection-service";

describe("WHU connection lifecycle", () => {
  it("requires name, number and token on create", () => {
    expect(() => buildWhuConnectionCreate({ name: "Gabinete", provider: "wescctech", token: "" }, "account-1"))
      .toThrow("Token WHU é obrigatório");
  });

  it("normalizes number and fingerprints the unencrypted token", () => {
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    expect(buildWhuConnectionCreate({ name: "Gabinete", provider: "wescctech", token: "secret", phoneNumber: "+55 51 99999-0000" }, "account-1"))
      .toMatchObject({ accountId: "account-1", phoneNumber: "5551999990000", status: "pending" });
  });

  it("preserves token identity when update token is blank", () => {
    const existing = { id: "c1", accountId: "a1", token: "encrypted", tokenFingerprint: "fingerprint", phoneNumber: "5551999990000" };
    expect(buildWhuConnectionUpdate({ name: "Novo nome", token: "" }, existing)).toMatchObject({ tokenFingerprint: "fingerprint" });
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run server/services/channel-connection-service.test.ts`

Expected: FAIL because the lifecycle service does not exist.

- [ ] **Step 3: Implement lifecycle builders and stable errors**

Implement exported builders returning validated plain records. Use error objects with codes:

```ts
export class ConnectionValidationError extends Error {
  constructor(public code: "WHU_TOKEN_REQUIRED" | "WHU_PHONE_REQUIRED" | "WHU_NAME_REQUIRED" | "WHU_DUPLICATE_PHONE" | "WHU_DUPLICATE_TOKEN", message: string) {
    super(message);
  }
}
```

The create builder must set `channel: "whatsapp"`, `provider: "wescctech"`, normalized `phoneNumber`, fingerprint, `status: "pending"`, and mirrored `metadata.phoneNumber`. The update builder must preserve `tokenFingerprint` when token is blank or masked.

- [ ] **Step 4: Add scoped storage lookups and history detection**

Add to `IStorage` and `DatabaseStorage`:

```ts
findActiveChannelConnectionByPhone(accountId: string, phoneNumber: string, excludeId?: string): Promise<ChannelConnection | null>;
findActiveChannelConnectionByTokenFingerprint(accountId: string, fingerprint: string, excludeId?: string): Promise<ChannelConnection | null>;
channelConnectionHasHistory(accountId: string, connectionId: string): Promise<boolean>;
```

Use `and`, `eq`, `ne`, and `sql` so every lookup includes `accountId`, excludes `status = 'disabled'`, and checks conversation/campaign references without loading full histories.

Implement history detection as an existence query over both references:

```ts
const [row] = await db.execute(sql`
  SELECT EXISTS (
    SELECT 1 FROM att_conversations
    WHERE account_id = ${accountId} AND connection_id = ${connectionId}
    UNION ALL
    SELECT 1 FROM marketing_campaigns
    WHERE account_id = ${accountId}
      AND (
        send_config->>'waConnectionId' = ${connectionId}
        OR template_config->>'waConnectionId' = ${connectionId}
      )
  ) AS used
`);
return Boolean((row as any)?.used);
```

- [ ] **Step 5: Route create/update/delete through the service**

In `server/attendance-routes.ts`:

```ts
const prepared = buildWhuConnectionCreate(req.body, req.accountId!);
await assertWhuConnectionUnique(storage, prepared, undefined);
const conn = await storage.createChannelConnection(
  prepareChannelConnectionSecrets({ ...prepared, id: crypto.randomUUID() }),
);
```

For delete:

```ts
const hasHistory = await storage.channelConnectionHasHistory(req.accountId!, before.id);
if (hasHistory) {
  const disabled = await storage.updateChannelConnection(before.id, req.accountId!, { status: "disabled" });
  return res.json(maskChannelConnectionSecrets(disabled));
}
await storage.deleteChannelConnection(before.id, req.accountId!);
return res.json({ success: true, deleted: true });
```

- [ ] **Step 6: Extend masked responses**

Update `maskChannelConnectionSecrets` so callers receive `hasToken: Boolean(connection.token)` and never receive `tokenFingerprint`:

```ts
result.hasToken = Boolean(connection.token);
result.token = connection.token ? "***" : null;
delete result.tokenFingerprint;
```

- [ ] **Step 7: Run focused tests and route security tests**

Run: `npx vitest run server/services/channel-connection-service.test.ts server/services/data-secret-fields.test.ts server/attendance-route-security.test.ts`

Expected: all tests PASS.

- [ ] **Step 8: Commit only Task 2 files**

```bash
git add server/services/channel-connection-service.ts server/services/channel-connection-service.test.ts server/services/data-secret-fields.ts server/services/data-secret-fields.test.ts server/storage.ts server/attendance-routes.ts
git commit -m "feat: manage multiple WHU connections safely"
```

---

### Task 3: Connection-Aware Inbound Conversation Routing

**Files:**
- Create: `server/services/attendance-connection-routing.ts`
- Test: `server/services/attendance-connection-routing.test.ts`
- Modify: `server/storage.ts`
- Modify: `server/attendance-routes.ts`
- Create: `migrations/0020_attendance_connection_thread_identity.sql`

**Interfaces:**
- Produces: `getConversationByExternal(accountId, externalThreadId, connectionId?)`
- Produces: unique active thread identity `(account_id, connection_id, external_thread_id)`
- Produces: `assertInboundConnection(connection): void`

- [ ] **Step 1: Write failing routing tests**

```ts
import { describe, expect, it } from "vitest";
import { assertInboundConnection } from "./attendance-connection-routing";

describe("attendance connection routing", () => {
  it("rejects disabled inbound connections without affecting another connection", () => {
    expect(() => assertInboundConnection({ id: "a", status: "disabled", channel: "whatsapp" })).toThrow("Conexão desativada");
    expect(() => assertInboundConnection({ id: "b", status: "connected", channel: "whatsapp" })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run server/services/attendance-connection-routing.test.ts`

Expected: FAIL because the routing service is absent.

- [ ] **Step 3: Make conversation lookup connection-aware**

Change storage signature and query:

```ts
getConversationByExternal(accountId: string, externalThreadId: string, connectionId?: string): Promise<AttConversation | null>;
```

When `connectionId` is present, include `eq(attConversations.connectionId, connectionId)`. Keep the optional form only for legacy records that have no connection.

- [ ] **Step 4: Add the thread-identity migration**

```sql
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM att_conversations
    WHERE connection_id IS NOT NULL AND external_thread_id IS NOT NULL
    GROUP BY account_id, connection_id, external_thread_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate attendance threads exist for account/connection/external_thread_id; resolve them before applying 0020';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS att_conversations_account_connection_thread_uidx
ON att_conversations (account_id, connection_id, external_thread_id)
WHERE connection_id IS NOT NULL AND external_thread_id IS NOT NULL;
```

- [ ] **Step 5: Bind webhook lookup and reject disabled connections**

Change webhook handling to:

```ts
assertInboundConnection(conn);
let conv = await storage.getConversationByExternal(conn.accountId, externalThreadId, conn.id);
```

Retain `snapshotAttendanceConnection(conn)` so list and chat views remain auditable after connection edits.

- [ ] **Step 6: Test two numbers with the same external thread ID**

Post the same `externalThreadId` to two connection IDs and assert the routing calls:

```ts
expect(storage.getConversationByExternal).toHaveBeenNthCalledWith(1, "account-1", "thread-1", "connection-a");
expect(storage.getConversationByExternal).toHaveBeenNthCalledWith(2, "account-1", "thread-1", "connection-b");
expect(storage.createConversation).toHaveBeenNthCalledWith(1, expect.objectContaining({ connectionId: "connection-a", inboundNumber: "5551999990001" }));
expect(storage.createConversation).toHaveBeenNthCalledWith(2, expect.objectContaining({ connectionId: "connection-b", inboundNumber: "5551999990002" }));
```

- [ ] **Step 7: Run focused and storage tests**

Run: `npx vitest run server/services/attendance-connection-routing.test.ts server/services/attendance-connection-snapshot.test.ts server/attendance-route-security.test.ts`

Expected: all tests PASS.

- [ ] **Step 8: Commit only Task 3 files**

```bash
git add migrations/0020_attendance_connection_thread_identity.sql server/services/attendance-connection-routing.ts server/services/attendance-connection-routing.test.ts server/storage.ts server/attendance-routes.ts
git commit -m "fix: isolate inbound conversations by WHU number"
```

---

### Task 4: Strict Outbound Attendance Routing

**Files:**
- Modify: `server/services/attendance-connection-routing.ts`
- Modify: `server/services/attendance-connection-routing.test.ts`
- Modify: `server/attendance-routes.ts`
- Modify: `client/src/pages/attendance.tsx`
- Test: `client/src/pages/attendance-new-conversation.test.ts`

**Interfaces:**
- Produces: `requireConversationSendConnection(conversation, connection): ChannelConnection`
- Produces: `requireNewConversationConnection(connection): ChannelConnection`

- [ ] **Step 1: Write failing strict-routing tests**

```ts
it("never falls back when a conversation has an unavailable bound connection", () => {
  expect(() => requireConversationSendConnection(
    { connectionId: "connection-a" },
    { id: "connection-a", status: "error", channel: "whatsapp", provider: "wescctech" },
  )).toThrow("O número desta conversa está indisponível");
});

it("requires an explicit connected sender for a new conversation", () => {
  expect(() => requireNewConversationConnection(null)).toThrow("Selecione o número de WhatsApp");
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npx vitest run server/services/attendance-connection-routing.test.ts`

Expected: FAIL because the strict routing functions are missing.

- [ ] **Step 3: Remove cross-token fallback for bound conversations**

In every reply, media, reaction, typing, transfer, and close operation that calls `getWesccToken`, resolve `conv.connectionId` first. If it exists and the connection/token is unavailable, return a connection-specific error. Use the account-level integration fallback only when `conv.connectionId` is null on a legacy conversation.

- [ ] **Step 4: Require connection before creating a new conversation**

In `POST /api/attendance/conversations/create-new`:

```ts
if (!connectionId) return res.status(400).json({ code: "WHU_CONNECTION_REQUIRED", error: "Selecione o número de WhatsApp" });
const connection = await storage.getChannelConnection(connectionId, req.accountId!);
requireNewConversationConnection(connection);
```

Create the conversation only after validation and persist `connectionId` plus its snapshot before sending the first message.

- [ ] **Step 5: Enforce selection in the dialog**

Disable submission while `connectionId` is empty and show an inline message:

```tsx
{!connectionId ? <p role="alert" className="text-xs text-destructive">Selecione por qual número o atendimento será iniciado.</p> : null}
<Button disabled={!connectionId || mutation.isPending}>Iniciar atendimento</Button>
```

- [ ] **Step 6: Add frontend selection tests**

Test that no number is auto-selected, the submit button is disabled initially, choosing a connected option enables it, and the API payload contains the selected `connectionId`.

- [ ] **Step 7: Run focused backend and frontend tests**

Run: `npx vitest run server/services/attendance-connection-routing.test.ts client/src/pages/attendance-new-conversation.test.ts`

Expected: all tests PASS.

- [ ] **Step 8: Commit only Task 4 files**

```bash
git add server/services/attendance-connection-routing.ts server/services/attendance-connection-routing.test.ts server/attendance-routes.ts client/src/pages/attendance.tsx client/src/pages/attendance-new-conversation.test.ts
git commit -m "fix: route attendance replies through originating WHU number"
```

---

### Task 5: Campaign Sender Selection and Execution Safety

**Files:**
- Modify: `server/services/campaign-whatsapp-connections.ts`
- Modify: `server/services/campaign-whatsapp-connections.test.ts`
- Modify: `server/routes.ts`
- Modify: `client/src/components/campaign-wizard.tsx`
- Modify: `client/src/components/campaign-wizard-message-composer.test.ts`

**Interfaces:**
- Consumes: `isConnectionAvailableForSend`
- Produces: campaign options containing only connected, tenant-scoped WhatsApp senders
- Preserves: `templateConfig.waConnectionId` through create, schedule, send, retry, and report paths

- [ ] **Step 1: Tighten the existing failing campaign expectation**

Extend the connection list test:

```ts
expect(listCampaignWhatsappConnectionOptions([
  normal,
  { ...normal, id: "pending", status: "pending" },
  { ...normal, id: "error", status: "error" },
])).map(option => option.id)).toEqual(["normal-1"]);
```

- [ ] **Step 2: Run the campaign service test and verify failure**

Run: `npx vitest run server/services/campaign-whatsapp-connections.test.ts`

Expected: FAIL because pending/error connections are currently included.

- [ ] **Step 3: Require connected campaign senders**

Update list and require functions so `status === "connected"` is mandatory. Keep official Meta and WHU type matching. Return only safe option fields and labels in the format `<number> — Normal (WHU)`.

- [ ] **Step 4: Validate the connection at every execution boundary**

Keep the existing `validateCampaignWhatsappConnection` call in create (`POST /api/campaigns`), update (`PATCH /api/campaigns/:id`), immediate send (`POST /api/campaigns/:id/send`), and retry/resume handlers. In `resolveCampaignIntegrations` and `processCampaign`, call the same exact guard:

```ts
requireCampaignWhatsappConnection(connections, config.waConnectionId, campaign.type);
```

Do not substitute the first available connection when the saved one is missing or unhealthy.

- [ ] **Step 5: Preserve mandatory selection in the wizard**

Keep `waConnectionId` empty on entry, show connected options only, block progression when it is absent, and retain the ID in `templateConfig` for both normal WHU and official WhatsApp campaigns.

- [ ] **Step 6: Run campaign service and wizard tests**

Run: `npx vitest run server/services/campaign-whatsapp-connections.test.ts server/services/campaigns.test.ts client/src/components/campaign-wizard-message-composer.test.ts`

Expected: all tests PASS.

- [ ] **Step 7: Commit only Task 5 files**

```bash
git add server/services/campaign-whatsapp-connections.ts server/services/campaign-whatsapp-connections.test.ts server/routes.ts client/src/components/campaign-wizard.tsx client/src/components/campaign-wizard-message-composer.test.ts
git commit -m "feat: require campaign WHU sender selection"
```

---

### Task 6: Legacy Single-Token Migration and Settings Consolidation

**Files:**
- Modify: `server/services/whatsapp-connection-config.ts`
- Modify: `server/services/whatsapp-connection-config.test.ts`
- Create: `server/services/legacy-whu-connection-migration.ts`
- Test: `server/services/legacy-whu-connection-migration.test.ts`
- Modify: `server/routes.ts`
- Modify: `client/src/pages/settings.tsx`

**Interfaces:**
- Produces: `migrateLegacyWhuIntegration(accountId, integration, repository): Promise<ChannelConnection>`
- Preserves: existing `settings-omni` connection ID and encrypted token
- Stops: ongoing two-way single-token synchronization after canonical migration

- [ ] **Step 1: Write migration idempotency tests**

```ts
it("reuses the legacy-origin connection when migration runs twice", async () => {
  const repository = fakeRepository({ existing: null });
  const first = await migrateLegacyWhuIntegration("account-1", integration, repository);
  repository.existing = first;
  const second = await migrateLegacyWhuIntegration("account-1", integration, repository);
  expect(second.id).toBe(first.id);
  expect(repository.created).toHaveLength(1);
});
```

- [ ] **Step 2: Run the migration test and verify failure**

Run: `npx vitest run server/services/legacy-whu-connection-migration.test.ts`

Expected: FAIL because the migration service is missing.

- [ ] **Step 3: Implement idempotent migration**

Match an existing connection by `metadata.source === "settings-omni"`, preserve its ID, normalize any known phone, re-encrypt the token with connection-bound context, populate the token fingerprint, and mark `metadata.legacyOrigin = true`. Never delete or blank the integration record.

- [ ] **Step 4: Replace save-time two-way synchronization**

Keep a compatibility migration call for legacy records, but make `channel_connections` authoritative after a migrated connection exists. Saving the old form must not overwrite a collection of connections or choose one arbitrarily.

- [ ] **Step 5: Consolidate the Settings UI**

Replace the single WHU token form with a summary and navigation action to the canonical connection manager. The screen must explain that each number has an independent token without exposing any stored secret.

- [ ] **Step 6: Run migration, config, and settings tests**

Run: `npx vitest run server/services/legacy-whu-connection-migration.test.ts server/services/whatsapp-connection-config.test.ts client/src/pages/settings*.test.ts`

Expected: all matching tests PASS.

- [ ] **Step 7: Commit only Task 6 files**

```bash
git add server/services/legacy-whu-connection-migration.ts server/services/legacy-whu-connection-migration.test.ts server/services/whatsapp-connection-config.ts server/services/whatsapp-connection-config.test.ts server/routes.ts client/src/pages/settings.tsx
git commit -m "refactor: consolidate WHU connection configuration"
```

---

### Task 7: Multi-Number Connection Management UI

**Files:**
- Create: `client/src/components/attendance/whu-connection-form.ts`
- Test: `client/src/components/attendance/whu-connection-form.test.ts`
- Modify: `client/src/components/attendance/SettingsTab.tsx`

**Interfaces:**
- Produces: `WhuConnectionFormValues`
- Produces: `buildWhuConnectionPayload(values, editing): ConnectionPayload`
- Consumes: connection API stable error codes and masked `hasToken`

- [ ] **Step 1: Write failing form-model tests**

```ts
import { describe, expect, it } from "vitest";
import { buildWhuConnectionPayload, validateWhuConnectionForm } from "./whu-connection-form";

describe("WHU connection form", () => {
  it("requires a token only when creating", () => {
    expect(validateWhuConnectionForm({ name: "Gabinete", phoneNumber: "5551999990000", token: "" }, false)).toContain("Token");
    expect(validateWhuConnectionForm({ name: "Gabinete", phoneNumber: "5551999990000", token: "" }, true)).toEqual([]);
  });

  it("builds one independent WHU payload per number", () => {
    expect(buildWhuConnectionPayload({ name: "Gabinete", phoneNumber: "+55 51 99999-0000", token: "secret" }, false))
      .toMatchObject({ channel: "whatsapp", provider: "wescctech", phoneNumber: "+55 51 99999-0000", token: "secret" });
  });
});
```

- [ ] **Step 2: Run form tests and verify failure**

Run: `npx vitest run client/src/components/attendance/whu-connection-form.test.ts`

Expected: FAIL because the form helper does not exist.

- [ ] **Step 3: Implement the focused form model**

Create pure validation and payload functions. Keep token preservation represented by an omitted `token` property during editing when the field is blank.

- [ ] **Step 4: Upgrade the connection list and dialog**

Add phone number, last check, error state, disable/reactivate action, token-preservation copy, and a read-only webhook URL:

```tsx
<Input readOnly value={`${window.location.origin}/api/webhooks/attendance/whatsapp/${connection.id}`} />
```

Use icons with tooltips for edit, disable/reactivate, and copy-webhook actions. Do not nest cards or expose token/fingerprint values.

- [ ] **Step 5: Map stable API errors to actionable messages**

Handle `WHU_DUPLICATE_PHONE`, `WHU_DUPLICATE_TOKEN`, `WHU_TOKEN_REQUIRED`, and provider-test errors without replacing server validation with client-only checks.

- [ ] **Step 6: Run form tests and accessibility-focused component checks**

Run: `npx vitest run client/src/components/attendance/whu-connection-form.test.ts && npm run check`

Expected: tests PASS and TypeScript exits with code 0.

- [ ] **Step 7: Commit only Task 7 files**

```bash
git add client/src/components/attendance/whu-connection-form.ts client/src/components/attendance/whu-connection-form.test.ts client/src/components/attendance/SettingsTab.tsx
git commit -m "feat: add multi-number WHU connection manager"
```

---

### Task 8: Connection Identity in Attendance Views

**Files:**
- Modify: `client/src/components/attendance/ConversationList.tsx`
- Modify: `client/src/components/attendance/ChatPanel.tsx`
- Modify: `client/src/components/attendance/conversation-list-lanes.test.ts`
- Modify: `server/services/attendance-connection-snapshot.test.ts`

**Interfaces:**
- Consumes: `inboundConnectionName`, `inboundNumber`, and immutable `connectionId`
- Produces: visible `Recebido por` and `Respondendo por` identity

- [ ] **Step 1: Add failing display-helper tests**

Extract and test a pure display helper in `ConversationList.tsx`:

```ts
export function attendanceConnectionLabel(conversation: Pick<AttConversation, "inboundConnectionName" | "inboundNumber">): string {
  const name = conversation.inboundConnectionName?.trim();
  const number = conversation.inboundNumber ? formatPhone(conversation.inboundNumber) : null;
  if (name && number) return `${name} · ${number}`;
  return name ?? number ?? "Número não identificado";
}

expect(attendanceConnectionLabel({ inboundConnectionName: "Gabinete", inboundNumber: "5551999990000" }))
  .toBe("Gabinete · +55 51 99999-0000");
expect(attendanceConnectionLabel({ inboundConnectionName: null, inboundNumber: null }))
  .toBe("Número não identificado");
```

- [ ] **Step 2: Run the focused UI tests and verify failure**

Run: `npx vitest run client/src/components/attendance/conversation-list-lanes.test.ts server/services/attendance-connection-snapshot.test.ts`

Expected: at least the new display expectation FAILS.

- [ ] **Step 3: Show connection identity without changing routing**

In the list, add a compact secondary line with the receiving number. In the chat header, add a fixed identity row:

```tsx
<span className="text-xs text-muted-foreground">
  Respondendo por {conversation.inboundConnectionName ?? "Conexão WhatsApp"}
  {conversation.inboundNumber ? ` · ${formatPhone(conversation.inboundNumber)}` : ""}
</span>
```

Do not add a selector to an existing conversation because replies must remain on the original number.

- [ ] **Step 4: Run focused UI tests**

Run: `npx vitest run client/src/components/attendance/conversation-list-lanes.test.ts server/services/attendance-connection-snapshot.test.ts`

Expected: all tests PASS.

- [ ] **Step 5: Commit only Task 8 files**

```bash
git add client/src/components/attendance/ConversationList.tsx client/src/components/attendance/ChatPanel.tsx client/src/components/attendance/conversation-list-lanes.test.ts server/services/attendance-connection-snapshot.test.ts
git commit -m "feat: identify WHU number in attendance history"
```

---

### Task 9: API Documentation, End-to-End Coverage, and Delivery Gate

**Files:**
- Create: `docs/api/attendance-whu-connections.md`
- Modify: `docs/ATENDIMENTO_OMNICHANNEL.md`
- Modify: `tests/e2e/critical-flows.spec.ts`

**Interfaces:**
- Documents: endpoint permissions, payloads, responses, status codes, stable errors, webhook format, and rollback behavior
- Verifies: complete local multi-token workflow without production publication

- [ ] **Step 1: Add the E2E regression**

Add a flow that:

```ts
async function createWhuConnection(page: Page, input: { name: string; phone: string; token: string }) {
  await page.getByTestId("button-new-connection").click();
  await page.getByTestId("input-connection-name").fill(input.name);
  await page.getByTestId("input-connection-phone-number").fill(input.phone);
  await page.getByTestId("input-connection-token").fill(input.token);
  await page.getByTestId("button-save-connection").click();
  await expect(page.getByText(input.name)).toBeVisible();
}

test("manages multiple WHU senders and requires an explicit sender", async ({ page }) => {
  await page.goto("/attendance?tab=settings");
  await createWhuConnection(page, { name: "Gabinete", phone: "+55 51 99999-0001", token: "test-token-1" });
  await createWhuConnection(page, { name: "Campanha", phone: "+55 51 99999-0002", token: "test-token-2" });
  await page.goto("/attendance");
  await page.getByTestId("button-new-conversation").click();
  await expect(page.getByRole("button", { name: "Iniciar atendimento" })).toBeDisabled();
  await page.getByTestId("select-new-conv-channel").click();
  await page.getByRole("option", { name: /Gabinete/ }).click();
  await expect(page.getByRole("button", { name: "Iniciar atendimento" })).toBeEnabled();
});
```

Use route mocks or local seeded credentials so no real WHU token is contacted.

- [ ] **Step 2: Run the E2E test and verify behavior**

Run: `npx playwright test tests/e2e/critical-flows.spec.ts --grep "multiple WHU"`

Expected: PASS against the local server; if PostgreSQL is unavailable, record the exact infrastructure blocker and run component/API tests instead.

- [ ] **Step 3: Write the complete API contract**

Write one contract section per endpoint using this response shape:

```json
{
  "id": "connection-uuid",
  "name": "Gabinete",
  "channel": "whatsapp",
  "provider": "wescctech",
  "phoneNumber": "5551999990000",
  "status": "connected",
  "hasToken": true,
  "token": "***",
  "lastTestedAt": "2026-08-17T18:00:00.000Z",
  "lastError": null
}
```

For each endpoint list its `attendanceSettings` or attendance-read permission, request body, 200/400/401/403/404 responses, and stable errors `WHU_CONNECTION_REQUIRED`, `WHU_DUPLICATE_PHONE`, and `WHU_DUPLICATE_TOKEN`.

- [ ] **Step 4: Update operational documentation**

Add numbered procedures for creating two numbers, testing each connection, copying each `/api/webhooks/attendance/whatsapp/:connectionId` URL, confirming `Recebido por`, selecting `waConnectionId` in a campaign, rotating one token, disabling a connection, and restoring the preserved legacy integration. Use only placeholders such as `<WHU_TOKEN_NUMBER_1>`.

- [ ] **Step 5: Run focused suites**

Run:

```bash
npx vitest run \
  server/services/whu-connection-identity.test.ts \
  server/services/channel-connection-service.test.ts \
  server/services/attendance-connection-routing.test.ts \
  server/services/campaign-whatsapp-connections.test.ts \
  server/services/legacy-whu-connection-migration.test.ts \
  client/src/components/attendance/whu-connection-form.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 6: Run complete verification**

Run: `npm test && npm run check && npm run build && npm run security:secrets`

Expected: full Vitest suite PASS, TypeScript exits 0, production build completes, and secret scan reports no leaked credentials.

- [ ] **Step 7: Validate the browser locally**

Start the existing local development server on an available port, then verify desktop and mobile layouts for connection management, new-conversation selection, conversation identity, and campaign sender selection. Capture Playwright screenshots and confirm no overlapping text or controls.

- [ ] **Step 8: Commit documentation and E2E coverage**

```bash
git add docs/api/attendance-whu-connections.md docs/ATENDIMENTO_OMNICHANNEL.md tests/e2e/critical-flows.spec.ts
git commit -m "test: validate multiple WHU connection workflow"
```

- [ ] **Step 9: Final scope audit**

Before Task 1, record `IMPLEMENTATION_BASE=$(git rev-parse HEAD)`. At the final audit run: `git status --short` and `git diff --stat "$IMPLEMENTATION_BASE"..HEAD`.

Expected: feature commits contain only planned files; pre-existing unrelated dirty changes remain untouched; no push or deployment has occurred.

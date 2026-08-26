# Multiple WHU Connections Design

Date: 2026-08-17
Status: Approved for implementation planning

## Objective

Allow each Politicall account to configure multiple WHU WhatsApp numbers, with one token per number. All active numbers must receive conversations concurrently. Replies must use the same connection that received the conversation, while operator-initiated conversations and campaigns must require an explicit sender-number selection.

## Current State

Politicall currently has two overlapping configuration paths:

- `integrations` stores a single account-level WhatsApp/WHU token and synchronizes it to a legacy `settings-omni` connection.
- `channel_connections` already supports multiple records, encrypted tokens, individual health checks, connection-aware webhooks, conversation linkage, and connection selection in parts of Attendance and Campaigns.

The implementation will make `channel_connections` the source of truth for WHU numbers while preserving a compatibility fallback for the legacy integration during migration.

## Domain Model

Each WHU number is represented by one `channel_connections` record:

- `accountId`: tenant owner.
- `name`: operator-facing connection name, such as `Gabinete`.
- `channel`: `whatsapp`.
- `provider`: `wescctech` for WHU.
- `token`: independently encrypted WHU token.
- `status`: `pending`, `connected`, `error`, or `disabled`.
- `metadata.phoneNumber`: normalized sender/receiver number.
- `metadata.externalChannelId`: provider identifier when available.
- `metadata.apiType`: `whu`.
- `metadata.webhookSecret`: optional encrypted webhook secret.
- timestamps and last health-check error.

`att_conversations.connectionId` remains the immutable routing reference for a conversation. The existing inbound connection snapshot fields remain available for audit and display if a connection is later renamed or disabled.

## Business Rules

1. One token belongs to one WhatsApp number.
2. Multiple active WHU connections may coexist in the same account.
3. A number cannot be duplicated inside the same account after normalization.
4. A token cannot be reused by two active connections in the same account. Token comparison must use a non-reversible fingerprint rather than plaintext.
5. Incoming messages from every active connection are accepted concurrently.
6. Incoming conversations are bound to the webhook connection and preserve that `connectionId`.
7. Replies always use the conversation's bound connection; the operator cannot accidentally reply through another number.
8. Starting a new conversation requires selecting an active WHU number.
9. Creating or sending a WhatsApp campaign requires selecting an active WHU number.
10. A connection referenced by conversations or campaigns is disabled instead of physically deleted.
11. Disabled connections remain visible in historical records but cannot send or receive new work.
12. Tenant isolation applies to every connection lookup, update, test, send, and campaign selection.

## User Experience

### Connection Management

`Settings > Attendance > Connections` will be the canonical management surface.

Each connection row displays:

- friendly name;
- normalized phone number;
- provider/type;
- status;
- last test result;
- actions to test, edit, disable, or reactivate.

The create form requires a name, phone number, and token. The edit form masks the stored token and preserves it when the field is blank. Errors must distinguish invalid credentials, duplicate number, duplicate token, unreachable provider, and disconnected channel.

The legacy single-token WhatsApp form in general Settings must either direct users to the connection manager or render the same connection collection. It must not continue maintaining an independent token state.

### Attendance

The conversation list and chat header display the inbound connection name and number. A reply uses the stored `connectionId` automatically.

The new-conversation dialog requires a connection selection before submission and shows only active WHU connections. No implicit fallback is allowed when more than one connection exists. The selected connection is persisted on the newly created conversation before the first message is sent.

### Campaigns

The campaign wizard lists active WHU connections with friendly name and phone number. Selecting a connection stores its ID in campaign configuration. Send and retry operations validate that the selected connection still belongs to the account and remains active. Historical campaign reports retain the selected connection snapshot.

## API Contracts

The existing connection endpoints remain the foundation:

- `GET /api/attendance/connections`: list all connections for authorized settings users.
- `GET /api/attendance/connections/available`: list active connections available to Attendance and Campaigns.
- `POST /api/attendance/connections`: create and encrypt a connection.
- `PATCH /api/attendance/connections/:id`: update metadata or rotate a token.
- `DELETE /api/attendance/connections/:id`: disable when referenced; delete only when unused.
- `POST /api/attendance/connections/:id/test`: test exactly that connection.
- `POST /api/webhooks/attendance/:channel/:connectionId`: receive and route inbound events to the referenced connection.
- `GET /api/campaigns/whatsapp/connections`: return eligible campaign senders.

Contract adjustments:

- Create requires `name`, `phoneNumber`, `provider`, and `token` for WHU.
- Update accepts an omitted/blank token to preserve the secret.
- Responses never return token plaintext and expose only `hasToken` plus optional last-four/fingerprint-safe metadata.
- Available and campaign endpoints exclude disabled connections.
- New-conversation and campaign-send endpoints reject missing, disabled, cross-account, or incompatible connection IDs.
- Validation errors use stable codes in addition to localized messages.

## Inbound Routing

Each WHU connection receives a unique webhook URL containing its `connectionId`. The webhook resolves that record without trusting account identifiers supplied in the payload, validates connection state and optional secret, applies payload size/rate limits, and creates or updates a conversation using the resolved account and connection.

Conversation lookup must include the connection dimension where provider thread identifiers may collide across numbers. This prevents two WHU numbers receiving messages from the same contact from collapsing into one conversation.

Inbound connection name and number are snapshotted on the conversation for long-term auditability.

## Outbound Routing

All Attendance sends resolve the token from `att_conversations.connectionId`. A legacy account-level token may be used only for unmigrated historical data and must not override an explicit conversation connection.

Operator-initiated conversations validate the selected connection before creating the conversation. Campaign dispatch, retries, and scheduled workers resolve the saved campaign connection and never choose the first available token automatically.

## Migration and Compatibility

The migration is idempotent:

1. Detect an existing account-level WhatsApp integration.
2. Find its existing `settings-omni` connection, or create one when absent.
3. Copy the encrypted token and known phone metadata without exposing plaintext.
4. Mark the migrated record as a legacy-origin connection.
5. Preserve the integration record temporarily for rollback and old-code compatibility.
6. Stop two-way synchronization after the connection manager becomes authoritative.
7. Remove the fallback only in a later release after verifying that all active accounts have a valid connection.

No existing conversation, message, token, or campaign record is deleted by this migration.

## Security

- Encrypt every token with record-bound context.
- Never log, serialize, or return token plaintext.
- Use a keyed, non-reversible fingerprint for duplicate-token detection.
- Require `attendanceSettings` permission for connection administration.
- Permit read-only connection choices only through scoped available-connection endpoints.
- Validate `accountId` on every authenticated connection operation.
- Rate-limit and optionally authenticate each webhook independently.
- Record create, update, token rotation, test, disable, and reactivate actions in the attendance audit trail.
- Redact provider responses before storing or returning errors.

## Failure Handling

- A failing connection is isolated; other WHU numbers continue operating.
- Provider failures update only the affected connection health state.
- An inbound webhook for a disabled or unknown connection is rejected.
- Replies fail with a clear connection-specific message and never fall back to another sender.
- Campaign execution pauses/fails affected recipients if its selected connection is unavailable; it does not silently switch numbers.
- Token rotation preserves connection and conversation identities.

## Test Strategy

### Unit tests

- phone normalization and same-account duplicate detection;
- secret preservation and token fingerprint validation;
- connection eligibility and status filtering;
- conversation and campaign connection selection;
- legacy integration migration idempotency;
- no fallback to a different token when a bound connection fails.

### API and integration tests

- create, edit, rotate, test, disable, and reactivate multiple connections;
- secret masking and tenant isolation;
- simultaneous inbound webhooks for two numbers;
- same contact on two numbers creates separately routed conversations;
- reply uses the token associated with the inbound connection;
- new conversation rejects a missing connection;
- campaign rejects missing, disabled, or cross-account connections;
- referenced connection uses soft deletion.

### Frontend and end-to-end tests

- manage two WHU numbers independently;
- identify the receiving number in list and chat views;
- require number selection for new conversations;
- select a campaign sender and preserve it through review/send;
- show connection-specific validation and health errors;
- maintain layout and interaction behavior on desktop and mobile.

### Delivery validation

- TypeScript check;
- focused unit/integration suites;
- complete automated test suite;
- production build;
- local browser validation with two simulated WHU connections;
- no production publication as part of this change.

## Rollout and Rollback

The feature remains local for user validation. Rollout should later use migration-first deployment, health verification, and a feature flag or compatibility period before removing the legacy integration fallback.

Rollback keeps the legacy integration record intact, allowing the previous single-token path to be restored without losing new connection or conversation data. New schema changes must be additive during the compatibility period.

## Acceptance Criteria

- An account can configure and test at least two WHU numbers with distinct tokens.
- Both numbers can receive messages concurrently.
- The same external contact may have separate conversations through different numbers.
- Replies are always sent through the number that received the conversation.
- Operators must choose a number for new conversations.
- Campaign creators must choose a number before continuing.
- UI and reports identify the relevant number.
- Tokens remain encrypted and masked.
- One failed connection does not interrupt the others.
- Migration preserves the existing WHU setup and is safe to rerun.
- Required automated tests, type checking, and build pass locally.

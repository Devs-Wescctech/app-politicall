# WhatsApp Connections Summary

## GET `/api/integrations/whatsapp/connections-summary`

Returns the tenant-scoped, non-secret summary used by the Settings integrations page. Reading this endpoint also performs the idempotent migration of a legacy `integrations.service = whatsapp` record when no migrated `settings-omni` connection exists yet.

### Authentication and permission

- Authenticated tenant session.
- Requires either `marketing` or `attendanceSettings` permission.

### Request

No path, query or body parameters.

### Success response

`200 OK`

```json
[
  {
    "id": "2adbd158-b164-5e51-a7a0-05f610d1d258",
    "name": "WhatsApp / WHU",
    "phoneNumber": "5551999990000",
    "provider": "wescctech",
    "status": "connected",
    "lastTestedAt": "2026-08-17T12:00:00.000Z",
    "lastError": null,
    "type": "whu"
  }
]
```

`type` is `whu` or `official`. Provider error details are reduced to `Falha no último teste`. Tokens, encrypted values, token fingerprints, webhook secrets and masked secret placeholders are never returned.

### Errors

- `401 Unauthorized`: no valid session.
- `403 Forbidden`: missing permission.
- `500 Internal Server Error`: migration or persistence failure. The response follows the application's standard JSON error envelope.

### Write compatibility

After a connection has metadata `source: settings-omni` and `legacyOrigin: true`, the generic WhatsApp integration save/test endpoints reject legacy collection management. WhatsApp numbers must then be managed through `/api/attendance/connections`. SMS and email integration endpoints are unchanged.

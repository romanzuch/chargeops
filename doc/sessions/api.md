# Charging Sessions API Documentation

## Overview

Charging sessions track EV charging activity — from the moment a session starts on
a plug through to completion (or error). Sessions resolve a tariff at start time and
record energy consumed and cost.

All session endpoints require JWT + tenant context. The `tenant_admin` role can view
all sessions in the tenant; other roles can only view and manage their own sessions.

**Base auth:** `Authorization: Bearer <accessToken>` + `X-Tenant-Id: <tenantId>`

---

## Response Shape

```json
{
  "id": "f6a7b8c9-d0e1-2345-fghi-678901cdef23",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "plugId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "tenantId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "tariffId": "d4e5f6a7-b8c9-0123-defg-456789abcdef",
  "startedAt": "2026-02-25T10:00:00.000Z",
  "endedAt": "2026-02-25T10:45:00.000Z",
  "energyKwh": 22.5,
  "cost": 8.63,
  "currency": "EUR",
  "status": "completed",
  "createdAt": "2026-02-25T10:00:00.000Z",
  "updatedAt": "2026-02-25T10:45:00.000Z"
}
```

| Field       | Type              | Notes |
|-------------|-------------------|-------|
| `id`        | `string` (UUID)   | Session UUID |
| `userId`    | `string` (UUID)   | User who started the session |
| `plugId`    | `string` (UUID)   | Plug (connector) used |
| `tenantId`  | `string` (UUID)   | Owning tenant |
| `tariffId`  | `string \| null`  | Tariff resolved at session start (null if none found) |
| `startedAt` | `string`          | ISO 8601; session start time |
| `endedAt`   | `string \| null`  | ISO 8601; null while session is active |
| `energyKwh` | `number \| null`  | kWh consumed; null while active |
| `cost`      | `number \| null`  | Calculated cost; null while active |
| `currency`  | `string \| null`  | ISO 4217 code; null if no tariff |
| `status`    | `string`          | One of `active`, `completed`, `error` |
| `createdAt` | `string`          | ISO 8601 |
| `updatedAt` | `string`          | ISO 8601 |

---

## Endpoints

### POST /sessions

Start a new charging session on a plug. Any tenant role can start a session.

The system resolves a tariff at start time based on the tenant's pricing configuration.
If no tariff is found, `tariffId` is `null` and cost will not be calculated.

**Request body:**

```json
{
  "plug_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

**Fields:**

| Field     | Type            | Required | Notes |
|-----------|-----------------|----------|-------|
| `plug_id` | `string` (UUID) | Yes      | The plug to charge on |

**Response (201 Created):** Full `SessionResponse` object with `status: "active"`.

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 400    | bad-request  | Invalid `plug_id` UUID |
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Missing/mismatched `X-Tenant-Id` |
| 404    | not-found    | Plug not found in this tenant |

**Example cURL:**

```bash
curl -X POST http://localhost:3000/sessions \
  -H "Authorization: Bearer <accessToken>" \
  -H "X-Tenant-Id: <tenantId>" \
  -H "Content-Type: application/json" \
  -d '{ "plug_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }'
```

---

### GET /sessions

List the authenticated user's own charging sessions within the tenant.

**Query params:** `limit` (default 20, max 100), `offset` (default 0)

**Response (200 OK):**

```json
{
  "data": [ /* SessionResponse[] */ ],
  "total": 12
}
```

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Missing/mismatched tenant |

---

### GET /sessions/:id

Get a single charging session.

- **Regular users** can only retrieve their own sessions.
- **`tenant_admin`** can retrieve any session in the tenant.

**Response (200 OK):** Single `SessionResponse` object.

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Missing/mismatched tenant |
| 404    | not-found    | Session not found, or belongs to another user (for non-admins) |

---

### PATCH /sessions/:id/end

End an active charging session. Only the session owner can end their own session.

Updates `endedAt`, calculates `energyKwh` and `cost` based on the resolved tariff,
and sets `status` to `completed`.

**Response (200 OK):** Updated `SessionResponse` object with `status: "completed"`.

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Missing/mismatched tenant, or session belongs to another user |
| 404    | not-found    | Session not found |

**Example cURL:**

```bash
curl -X PATCH http://localhost:3000/sessions/f6a7b8c9-d0e1-2345-fghi-678901cdef23/end \
  -H "Authorization: Bearer <accessToken>" \
  -H "X-Tenant-Id: <tenantId>"
```

---

### GET /tenant/sessions

List all charging sessions across the authenticated tenant. Requires `tenant_admin` role.

**Query params:** `limit` (default 20, max 100), `offset` (default 0)

**Response (200 OK):**

```json
{
  "data": [ /* SessionResponse[] */ ],
  "total": 347
}
```

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Not `tenant_admin`, or missing/mismatched `X-Tenant-Id` |

**Example cURL:**

```bash
curl http://localhost:3000/tenant/sessions \
  -H "Authorization: Bearer <accessToken>" \
  -H "X-Tenant-Id: <tenantId>"
```

---

## Session Lifecycle

```
POST /sessions          → status: "active"
PATCH /sessions/:id/end → status: "completed"
(on error)              → status: "error"
```

Active sessions have `endedAt: null`, `energyKwh: null`, and `cost: null`.
Once ended, these fields are populated by the service layer.

## Related Documents

- [`doc/plugs/api.md`](../plugs/api.md) — plug management (referenced by `plugId`)
- [`doc/tariffs/api.md`](../tariffs/api.md) — tariff resolution at session start
- [`doc/tenant-users/api.md`](../tenant-users/api.md) — user roles that govern session access

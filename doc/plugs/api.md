# Plugs API Documentation

## Overview

Plugs (connectors) are physical charging ports attached to a station. All plug
endpoints are nested under a station path (`/stations/:stationId/plugs`).

The plugs API has three access tiers:

- **Public read** — `GET /stations/:stationId/plugs` requires no authentication
  (station must have `visibility = 'public'`).
- **Tenant read** — `GET /tenant/stations/:stationId/plugs` requires JWT + tenant context
  + any tenant role.
- **Tenant write** — `POST`, `PATCH`, `DELETE` require JWT + tenant context +
  `tenant_admin` role.

**Base auth for protected endpoints:** `Authorization: Bearer <accessToken>` + `X-Tenant-Id: <tenantId>`

---

## Response Shape

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "stationId": "550e8400-e29b-41d4-a716-446655440000",
  "connectorType": "ccs",
  "maxPowerKw": 150.0,
  "status": "available",
  "createdAt": "2026-02-25T12:00:00.000Z",
  "updatedAt": "2026-02-25T12:00:00.000Z",
  "deletedAt": null
}
```

| Field           | Type             | Notes |
|-----------------|------------------|-------|
| `id`            | `string` (UUID)  | Plug UUID |
| `stationId`     | `string` (UUID)  | Parent station |
| `connectorType` | `string`         | One of `ccs`, `chademo`, `type2`, `type1`, `schuko`, `other` |
| `maxPowerKw`    | `number`         | Maximum power output in kilowatts (positive) |
| `status`        | `string`         | One of `available`, `occupied`, `out_of_service`, `reserved` |
| `createdAt`     | `string`         | ISO 8601 |
| `updatedAt`     | `string`         | ISO 8601 |
| `deletedAt`     | `string \| null` | Set when soft-deleted |

---

## Endpoints

### GET /stations/:stationId/plugs

Returns all plugs for a public station. No authentication required.

**Query params:** `limit` (default 20, max 100), `offset` (default 0)

**Response (200 OK):**

```json
{
  "data": [ /* PlugResponse[] */ ],
  "total": 3
}
```

**Error Scenarios:**

| Status | Error Type | Reason |
|--------|------------|--------|
| 404    | not-found  | Station does not exist or is not public |

**Example cURL:**

```bash
curl http://localhost:3000/stations/550e8400-e29b-41d4-a716-446655440000/plugs
```

---

### GET /tenant/stations/:stationId/plugs

Returns all plugs for a station in the authenticated tenant (any visibility). Requires any tenant role.

**Query params:** `limit` (default 20, max 100), `offset` (default 0)

**Response (200 OK):** Same paginated shape as the public endpoint.

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Missing/mismatched `X-Tenant-Id` |
| 404    | not-found    | Station not found in this tenant |

---

### POST /stations/:stationId/plugs

Add a plug to a station. Requires `tenant_admin` role. The station must belong to
the authenticated tenant.

**Request body:**

```json
{
  "connector_type": "ccs",
  "max_power_kw": 150.0,
  "status": "available"
}
```

**Fields:**

| Field            | Type     | Required | Notes |
|------------------|----------|----------|-------|
| `connector_type` | `string` | Yes      | One of `ccs`, `chademo`, `type2`, `type1`, `schuko`, `other` |
| `max_power_kw`   | `number` | Yes      | Must be positive |
| `status`         | `string` | No       | One of `available`, `occupied`, `out_of_service`, `reserved`; defaults to `available` |

**Response (201 Created):** Full `PlugResponse` object.

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 400    | bad-request  | Missing required fields or invalid values |
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Missing/mismatched tenant, or not `tenant_admin` |
| 404    | not-found    | Station not found in this tenant |

**Example cURL:**

```bash
curl -X POST http://localhost:3000/stations/550e8400-e29b-41d4-a716-446655440000/plugs \
  -H "Authorization: Bearer <accessToken>" \
  -H "X-Tenant-Id: <tenantId>" \
  -H "Content-Type: application/json" \
  -d '{
    "connector_type": "ccs",
    "max_power_kw": 150.0
  }'
```

---

### PATCH /stations/:stationId/plugs/:plugId

Update an existing plug. Requires `tenant_admin` role. At least one field required.

**Request body:**

```json
{
  "status": "out_of_service"
}
```

**Fields:**

| Field            | Type     | Notes |
|------------------|----------|-------|
| `connector_type` | `string` | One of `ccs`, `chademo`, `type2`, `type1`, `schuko`, `other` |
| `max_power_kw`   | `number` | Must be positive |
| `status`         | `string` | One of `available`, `occupied`, `out_of_service`, `reserved` |

**Response (200 OK):** Updated `PlugResponse` object.

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 400    | bad-request  | Empty body or invalid values |
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Missing/mismatched tenant, or not `tenant_admin` |
| 404    | not-found    | Station or plug not found in this tenant |

---

### DELETE /stations/:stationId/plugs/:plugId

Soft-delete a plug. Requires `tenant_admin` role.

**Response (204 No Content):** Empty body.

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Missing/mismatched tenant, or not `tenant_admin` |
| 404    | not-found    | Station or plug not found in this tenant |

**Example cURL:**

```bash
curl -X DELETE \
  http://localhost:3000/stations/550e8400-e29b-41d4-a716-446655440000/plugs/a1b2c3d4-e5f6-7890-abcd-ef1234567890 \
  -H "Authorization: Bearer <accessToken>" \
  -H "X-Tenant-Id: <tenantId>"
```

---

## Related Documents

- [`doc/stations/api.md`](../stations/api.md) — parent station endpoints
- [`doc/sessions/api.md`](../sessions/api.md) — charging sessions reference `plugId`

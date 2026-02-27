# Tariff Zones API Documentation

## Overview

Tariff zones define named regions used to apply specific pricing rules based on
geography or logical grouping. A zone can be linked to one or more locations and
one or more tariffs. All endpoints require JWT + tenant context + `tenant_admin` role.

**Base auth:** `Authorization: Bearer <accessToken>` + `X-Tenant-Id: <tenantId>`

---

## Response Shape

```json
{
  "id": "e5f6a7b8-c9d0-1234-efgh-567890bcdef1",
  "tenantId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "name": "City Centre Zone",
  "createdAt": "2026-02-25T12:00:00.000Z",
  "updatedAt": "2026-02-25T12:00:00.000Z"
}
```

| Field       | Type            | Notes |
|-------------|-----------------|-------|
| `id`        | `string` (UUID) | Zone UUID |
| `tenantId`  | `string` (UUID) | Owning tenant |
| `name`      | `string`        | Display name |
| `createdAt` | `string`        | ISO 8601 |
| `updatedAt` | `string`        | ISO 8601 |

---

## Endpoints

### GET /tariff-zones

List all tariff zones for the authenticated tenant.

**Query params:** `limit` (default 20, max 100), `offset` (default 0)

**Response (200 OK):**

```json
{
  "data": [ /* TariffZoneResponse[] */ ],
  "total": 4
}
```

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Not `tenant_admin`, or missing/mismatched `X-Tenant-Id` |

**Example cURL:**

```bash
curl http://localhost:3000/tariff-zones \
  -H "Authorization: Bearer <accessToken>" \
  -H "X-Tenant-Id: <tenantId>"
```

---

### GET /tariff-zones/:id

Get a single tariff zone.

**Response (200 OK):** Single `TariffZoneResponse` object.

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Not `tenant_admin`, or missing/mismatched tenant |
| 404    | not-found    | Zone not found in this tenant |

---

### POST /tariff-zones

Create a new tariff zone.

**Request body:**

```json
{
  "name": "City Centre Zone"
}
```

**Fields:**

| Field  | Type     | Required | Notes |
|--------|----------|----------|-------|
| `name` | `string` | Yes      | Non-empty, max 255 characters |

**Response (201 Created):** Full `TariffZoneResponse` object.

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 400    | bad-request  | Missing or empty `name` |
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Not `tenant_admin`, or missing/mismatched tenant |

**Example cURL:**

```bash
curl -X POST http://localhost:3000/tariff-zones \
  -H "Authorization: Bearer <accessToken>" \
  -H "X-Tenant-Id: <tenantId>" \
  -H "Content-Type: application/json" \
  -d '{ "name": "City Centre Zone" }'
```

---

### PATCH /tariff-zones/:id

Update a tariff zone's name. At least one field required.

**Request body:**

```json
{
  "name": "Premium City Zone"
}
```

**Response (200 OK):** Updated `TariffZoneResponse` object.

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 400    | bad-request  | Empty body |
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Not `tenant_admin`, or missing/mismatched tenant |
| 404    | not-found    | Zone not found in this tenant |

---

## Location Associations

Locations can be linked to a tariff zone to indicate that stations at those locations
apply the zone's pricing rules.

### POST /tariff-zones/:id/locations

Link a location to the tariff zone. The location must belong to the same tenant.

**Request body:**

```json
{
  "location_id": "9a8b7c6d-5e4f-3210-fedc-ba9876543210"
}
```

**Response (204 No Content):** Empty body.

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 400    | bad-request  | Invalid `location_id` UUID |
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Not `tenant_admin`, or missing/mismatched tenant |
| 404    | not-found    | Zone or location not found in this tenant |

---

### DELETE /tariff-zones/:id/locations/:locationId

Remove a location from the tariff zone.

**Response (204 No Content):** Empty body.

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Not `tenant_admin`, or missing/mismatched tenant |
| 404    | not-found    | Zone not found, or location not in this zone |

---

## Tariff Associations

### POST /tariff-zones/:id/tariffs

Link a tariff to the tariff zone. The tariff must belong to the same tenant.

**Request body:**

```json
{
  "tariff_id": "d4e5f6a7-b8c9-0123-defg-456789abcdef"
}
```

**Response (204 No Content):** Empty body.

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 400    | bad-request  | Invalid `tariff_id` UUID |
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Not `tenant_admin`, or missing/mismatched tenant |
| 404    | not-found    | Zone or tariff not found in this tenant |

---

### DELETE /tariff-zones/:id/tariffs/:tariffId

Remove a tariff from the tariff zone.

**Response (204 No Content):** Empty body.

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Not `tenant_admin`, or missing/mismatched tenant |
| 404    | not-found    | Zone not found, or tariff not in this zone |

---

## Related Documents

- [`doc/tariffs/api.md`](../tariffs/api.md) — tariff management
- [`doc/locations/api.md`](../locations/api.md) — location management
- [`doc/customer-groups/api.md`](../customer-groups/api.md) — zones can be assigned to customer groups

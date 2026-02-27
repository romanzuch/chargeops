# Locations API Documentation

## Overview

Locations represent physical addresses where EV charging stations can be installed.
A station references a location via its `locationId` field.

The locations API has three access tiers:

- **Public read** — `GET /locations` and `GET /locations/:id` require no authentication
  and return only locations with `visibility = 'public'`.
- **Tenant read** — `GET /tenant/locations` and `GET /tenant/locations/:id` require JWT
  + tenant context + any tenant role. They return all accessible locations in the
  caller's tenant.
- **Tenant write** — `POST`, `PATCH`, `DELETE` require JWT + tenant context +
  `tenant_admin` role.

**Base auth for protected endpoints:** `Authorization: Bearer <accessToken>` + `X-Tenant-Id: <tenantId>`

---

## Response Shape

```json
{
  "id": "9a8b7c6d-5e4f-3210-fedc-ba9876543210",
  "tenantId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "name": "Downtown Parking Garage",
  "address": "123 Main Street",
  "city": "Berlin",
  "country": "DE",
  "latitude": 52.5200,
  "longitude": 13.4050,
  "visibility": "public",
  "createdAt": "2026-02-25T12:00:00.000Z",
  "updatedAt": "2026-02-25T12:00:00.000Z",
  "deletedAt": null
}
```

| Field        | Type              | Notes |
|--------------|-------------------|-------|
| `id`         | `string` (UUID)   | Location UUID |
| `tenantId`   | `string` (UUID)   | Owning tenant |
| `name`       | `string`          | Display name |
| `address`    | `string \| null`  | Street address |
| `city`       | `string \| null`  | City |
| `country`    | `string \| null`  | Country code (e.g., `DE`, `US`) |
| `latitude`   | `number \| null`  | `-90` to `90` |
| `longitude`  | `number \| null`  | `-180` to `180` |
| `visibility` | `string`          | `public` or `private` |
| `createdAt`  | `string`          | ISO 8601 |
| `updatedAt`  | `string`          | ISO 8601 |
| `deletedAt`  | `string \| null`  | Set when soft-deleted |

---

## Endpoints

### GET /locations

Returns all public locations across all tenants. No authentication required.

**Query params:** `limit` (default 20, max 100), `offset` (default 0)

**Response (200 OK):**

```json
{
  "data": [ /* LocationResponse[] */ ],
  "total": 42
}
```

**Example cURL:**

```bash
curl http://localhost:3000/locations
```

---

### GET /locations/:id

Returns a single public location. No authentication required. Returns 404 for
private or non-existent locations.

**Response (200 OK):** Single `LocationResponse` object.

**Error Scenarios:**

| Status | Error Type | Reason |
|--------|------------|--------|
| 404    | not-found  | Location does not exist or is private |

**Example cURL:**

```bash
curl http://localhost:3000/locations/9a8b7c6d-5e4f-3210-fedc-ba9876543210
```

---

### GET /tenant/locations

Returns all accessible locations for the authenticated tenant. Requires any tenant role.

**Query params:** `limit` (default 20, max 100), `offset` (default 0)

**Response (200 OK):** Same paginated shape as `GET /locations` but includes locations of all visibility.

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Missing/mismatched `X-Tenant-Id` |

---

### GET /tenant/locations/:id

Returns a single location in the authenticated tenant (any visibility). Requires any tenant role.

**Response (200 OK):** Single `LocationResponse` object.

**Error Scenarios:**

| Status | Error Type | Reason |
|--------|------------|--------|
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Missing/mismatched tenant |
| 404    | not-found    | Location not found in this tenant |

---

### POST /locations

Create a new location. Requires `tenant_admin` role.

**Request body:**

```json
{
  "name": "Downtown Parking Garage",
  "address": "123 Main Street",
  "city": "Berlin",
  "country": "DE",
  "latitude": 52.5200,
  "longitude": 13.4050,
  "visibility": "public"
}
```

**Fields:**

| Field        | Type     | Required | Notes |
|--------------|----------|----------|-------|
| `name`       | `string` | Yes      | Non-empty, max 255 characters |
| `address`    | `string` | No       | Max 500 characters |
| `city`       | `string` | No       | Max 255 characters |
| `country`    | `string` | No       | Max 100 characters |
| `latitude`   | `number` | No       | `-90` to `90` |
| `longitude`  | `number` | No       | `-180` to `180` |
| `visibility` | `string` | No       | `public` or `private`; defaults to `public` |

**Response (201 Created):** Full `LocationResponse` object.

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 400    | bad-request  | Missing `name` or invalid field values |
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Missing/mismatched tenant, or not `tenant_admin` |

**Example cURL:**

```bash
curl -X POST http://localhost:3000/locations \
  -H "Authorization: Bearer <accessToken>" \
  -H "X-Tenant-Id: <tenantId>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Downtown Parking Garage",
    "city": "Berlin",
    "country": "DE",
    "latitude": 52.5200,
    "longitude": 13.4050
  }'
```

---

### PATCH /locations/:id

Partially update a location. Requires `tenant_admin` role. At least one field required.
Pass `null` for `address`, `city`, `country`, `latitude`, or `longitude` to clear them.

**Request body:**

```json
{
  "visibility": "private",
  "city": null
}
```

**Fields:** Same as `POST /locations`, all optional. Nullable fields accept `null` to clear.

**Response (200 OK):** Updated `LocationResponse` object.

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 400    | bad-request  | Empty body or invalid values |
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Missing/mismatched tenant, or not `tenant_admin` |
| 404    | not-found    | Location not found in this tenant |

---

### DELETE /locations/:id

Soft-delete a location. Requires `tenant_admin` role. Sets `deleted_at` timestamp;
the record remains in the database but is excluded from all queries.

**Response (204 No Content):** Empty body.

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Missing/mismatched tenant, or not `tenant_admin` |
| 404    | not-found    | Location not found in this tenant |

**Example cURL:**

```bash
curl -X DELETE http://localhost:3000/locations/9a8b7c6d-5e4f-3210-fedc-ba9876543210 \
  -H "Authorization: Bearer <accessToken>" \
  -H "X-Tenant-Id: <tenantId>"
```

---

## Related Documents

- [`doc/stations/api.md`](../stations/api.md) — stations reference `locationId`
- [`doc/tariff-zones/api.md`](../tariff-zones/api.md) — locations can be linked to tariff zones

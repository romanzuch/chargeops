# Stations API Documentation

## Overview

The stations API has three access tiers:

- **Public read** — `GET /stations` and `GET /stations/:id` require no authentication.
  They return only stations with `visibility = 'public'`, making station discovery
  available to EV drivers browsing a map before signing in.
- **Tenant read** — `GET /tenant/stations` and `GET /tenant/stations/:id` require JWT +
  tenant context + any tenant role. They return all stations in the caller's tenant
  regardless of visibility.
- **Tenant write** — `POST /stations` and `PATCH /stations/:id` require JWT + tenant
  context + `tenant_admin` role. Operators can only create or modify stations within
  their own tenant and control `visibility`.

---

## Endpoints

### GET /stations

Returns all public stations across all tenants. No authentication required.

**Query params:** `limit` (default 20, max 100), `offset` (default 0)

**Response (200 OK):**

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "tenantId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      "name": "Main Street Hub",
      "externalId": "EXT-001",
      "locationId": "9a8b7c6d-5e4f-3210-fedc-ba9876543210",
      "status": "active",
      "visibility": "public",
      "createdAt": "2026-02-25T12:00:00.000Z",
      "updatedAt": "2026-02-25T12:00:00.000Z",
      "deletedAt": null
    }
  ],
  "total": 1
}
```

Returns `{ data: [], total: 0 }` if no public stations exist.

**Example cURL:**

```bash
curl http://localhost:3000/stations
```

---

### GET /stations/:id

Returns a single public station by ID. No authentication required.
Returns 404 for private stations or non-existent IDs — both cases are
intentionally indistinguishable to prevent ID enumeration.

**Response (200 OK):** Same shape as a single element from the `data` array in `GET /stations`.

**Error Scenarios:**

| Status | Error Type  | Reason                                   |
| ------ | ----------- | ---------------------------------------- |
| 404    | not-found   | Station does not exist or is private     |
| 500    | internal    | Server error (see logs)                  |

**Example cURL:**

```bash
curl http://localhost:3000/stations/550e8400-e29b-41d4-a716-446655440000
```

---

### GET /tenant/stations

Returns all stations in the authenticated tenant's scope — including private ones. Requires JWT + tenant context + any tenant role.

**Request:**

```
GET /tenant/stations
Authorization: Bearer <accessToken>
X-Tenant-Id: <tenantId>
```

**Query params:** `limit` (default 20, max 100), `offset` (default 0)

**Response (200 OK):** Same paginated shape as `GET /stations` but includes stations of all visibility levels.

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Missing `X-Tenant-Id` header or mismatched tenant |

---

### GET /tenant/stations/:id

Returns a single station by ID, scoped to the authenticated tenant (any visibility). Requires JWT + tenant context + any tenant role.

**Request:**

```
GET /tenant/stations/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer <accessToken>
X-Tenant-Id: <tenantId>
```

**Response (200 OK):** Same shape as `GET /stations/:id`.

**Error Scenarios:**

| Status | Error Type | Reason |
|--------|------------|--------|
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Missing/mismatched tenant |
| 404    | not-found    | Station not found in this tenant |

---

### POST /stations

Create a new station scoped to the authenticated tenant. Requires `tenant_admin` role.

**Request:**

```
POST /stations
Authorization: Bearer <accessToken>
X-Tenant-Id: <tenantId>
Content-Type: application/json
```

```json
{
  "name": "Main Street Hub",
  "external_id": "EXT-001",
  "location_id": "9a8b7c6d-5e4f-3210-fedc-ba9876543210",
  "status": "planning",
  "visibility": "private"
}
```

**Fields:**

| Field         | Type     | Required | Notes |
|---------------|----------|----------|-------|
| `name`        | `string` | Yes      | Non-empty, max 255 characters |
| `external_id` | `string` | No       | Reference to an external system, max 255 characters |
| `location_id` | `string` (UUID) | No | FK to a location in the same tenant |
| `status`      | `string` | No       | One of `active`, `planning`, `inactive`, `error`; defaults to `active` |
| `visibility`  | `string` | No       | `public` or `private`; defaults to `public` |

**Response (201 Created):**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "tenantId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "name": "Main Street Hub",
  "externalId": "EXT-001",
  "locationId": "9a8b7c6d-5e4f-3210-fedc-ba9876543210",
  "status": "planning",
  "visibility": "private",
  "createdAt": "2026-02-25T12:00:00.000Z",
  "updatedAt": "2026-02-25T12:00:00.000Z",
  "deletedAt": null
}
```

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 400    | bad-request  | Missing `name` or invalid field values |
| 401    | unauthorized | Missing or invalid Authorization header / expired token |
| 403    | forbidden    | Missing/mismatched tenant, or not `tenant_admin` |
| 500    | internal     | Server error (see logs) |

**Example cURL:**

```bash
curl -X POST http://localhost:3000/stations \
  -H "Authorization: Bearer <accessToken>" \
  -H "X-Tenant-Id: <tenantId>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Main Street Hub",
    "external_id": "EXT-001",
    "location_id": "9a8b7c6d-5e4f-3210-fedc-ba9876543210",
    "status": "planning",
    "visibility": "private"
  }'
```

---

### PATCH /stations/:id

Update an existing station within the authenticated tenant. Requires `tenant_admin` role.

Only the fields included in the request body are updated. Setting `external_id`
or `location_id` to `null` explicitly clears the stored value. At least one field
must be present.

**Request:**

```
PATCH /stations/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer <accessToken>
X-Tenant-Id: <tenantId>
Content-Type: application/json
```

```json
{
  "name": "Renamed Hub",
  "status": "active"
}
```

**Fields:**

| Field         | Type                    | Notes |
|---------------|-------------------------|-------|
| `name`        | `string`                | Non-empty, max 255 characters |
| `external_id` | `string \| null`        | Pass `null` to clear |
| `location_id` | `string (UUID) \| null` | FK to a location; pass `null` to clear |
| `status`      | `string`                | One of `active`, `planning`, `inactive`, `error` |
| `visibility`  | `string`                | `public` or `private` |

**Response (200 OK):**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "tenantId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "name": "Renamed Hub",
  "externalId": "EXT-001",
  "locationId": "9a8b7c6d-5e4f-3210-fedc-ba9876543210",
  "status": "active",
  "visibility": "public",
  "createdAt": "2026-02-25T12:00:00.000Z",
  "updatedAt": "2026-02-25T12:30:00.000Z",
  "deletedAt": null
}
```

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 400    | bad-request  | Empty body or invalid field values |
| 401    | unauthorized | Missing or invalid Authorization header / expired token |
| 403    | forbidden    | Missing/mismatched tenant, or not `tenant_admin` |
| 404    | not-found    | Station does not exist or belongs to a different tenant |
| 500    | internal     | Server error (see logs) |

**Security note:** A station that exists but belongs to a different tenant returns 404,
not 403. This prevents cross-tenant enumeration of station IDs.

**Example cURL:**

```bash
curl -X PATCH http://localhost:3000/stations/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer <accessToken>" \
  -H "X-Tenant-Id: <tenantId>" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "active"
  }'
```

---

## Tenant Isolation

Authenticated endpoints use `preHandler: [app.verifyJwt, app.verifyTenant, app.verifyRole([...])]`:

1. `verifyJwt` — validates the Bearer token and populates `request.jwtUser`
2. `verifyTenant` — validates the `X-Tenant-Id` header matches the JWT `tid` claim; populates `request.tenantId`
3. `verifyRole` — enforces that the caller has the required role (`tenant_admin` for writes, any role for reads)

The `tenantId` is then passed directly into every database query as a `WHERE tenant_id = ?`
clause. A station belonging to another tenant is indistinguishable from a non-existent
station at the route level.

See [`doc/tenancy.md`](../tenancy.md) for the full tenant context flow.

## Related Documents

- [`doc/stations/data-model.md`](./data-model.md) — schema reference
- [`doc/stations/repositories.md`](./repositories.md) — repository function reference
- [`doc/plugs/api.md`](../plugs/api.md) — plug endpoints (nested under stations)
- [`doc/locations/api.md`](../locations/api.md) — location endpoints (referenced by `locationId`)

---

## Error Response Format

All errors follow RFC 9457 Problem Details:

```json
{
  "type": "https://errors.chargeops.dev/not-found",
  "title": "Not Found",
  "status": 404,
  "detail": "Station not found",
  "instance": "/stations/550e8400-e29b-41d4-a716-446655440000",
  "traceId": "req-550e8400-e29b-41d4-a716-446655440000"
}
```


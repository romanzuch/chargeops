# Stations API Documentation

## Overview

The stations API has two access tiers:

- **Public read** — `GET /stations` and `GET /stations/:id` require no authentication.
  They return only stations with `visibility = 'public'`, making station discovery
  available to EV drivers browsing a map before signing in.
- **Operator write** — `POST /stations` and `PATCH /stations/:id` require a valid JWT
  and enforce tenant isolation. Operators can only create or modify stations within
  their own tenant. They also control `visibility` to choose whether a station
  appears in public discovery.

---

## Endpoints

### GET /stations

Returns all public stations across all tenants. No authentication required.

**Response (200 OK):**

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "tenantId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    "name": "Main Street Hub",
    "externalId": "EXT-001",
    "latitude": 48.8566,
    "longitude": 2.3522,
    "status": "active",
    "visibility": "public",
    "createdAt": "2026-02-25T12:00:00.000Z",
    "updatedAt": "2026-02-25T12:00:00.000Z",
    "deletedAt": null
  }
]
```

Returns an empty array if no public stations exist.

**Example cURL:**

```bash
curl http://localhost:3000/stations
```

---

### GET /stations/:id

Returns a single public station by ID. No authentication required.
Returns 404 for private stations or non-existent IDs — both cases are
intentionally indistinguishable to prevent ID enumeration.

**Response (200 OK):** Same shape as a single element from `GET /stations`.

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

### POST /stations

Create a new station scoped to the authenticated tenant.

**Request:**

```json
{
  "name": "Main Street Hub",
  "external_id": "EXT-001",
  "latitude": 48.8566,
  "longitude": 2.3522,
  "status": "planning"
}
```

**Fields:**

| Field         | Type     | Required | Notes                                                                 |
| ------------- | -------- | -------- | --------------------------------------------------------------------- |
| `name`        | `string` | Yes      | Non-empty, max 255 characters                                         |
| `external_id` | `string` | No       | Reference to an ID in an external system, max 255 characters          |
| `latitude`    | `number` | No       | `-90` to `90`; must be provided together with `longitude`             |
| `longitude`   | `number` | No       | `-180` to `180`; must be provided together with `latitude`            |
| `status`      | `string` | No       | One of `active`, `planning`, `inactive`, `error`; defaults to `active`|
| `visibility`  | `string` | No       | `public` or `private`; defaults to `public`                           |

**Response (201 Created):**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "tenantId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "name": "Main Street Hub",
  "externalId": "EXT-001",
  "latitude": 48.8566,
  "longitude": 2.3522,
  "status": "planning",
  "visibility": "public",
  "createdAt": "2026-02-25T12:00:00.000Z",
  "updatedAt": "2026-02-25T12:00:00.000Z",
  "deletedAt": null
}
```

**Error Scenarios:**

| Status | Error Type   | Reason                                                          |
| ------ | ------------ | --------------------------------------------------------------- |
| 400    | bad-request  | Missing `name`, invalid field values, or unpaired lat/lon       |
| 401    | unauthorized | Missing or invalid Authorization header / expired token         |
| 500    | internal     | Server error (see logs)                                         |

**Example cURL:**

```bash
curl -X POST http://localhost:3000/stations \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Main Street Hub",
    "external_id": "EXT-001",
    "latitude": 48.8566,
    "longitude": 2.3522,
    "status": "planning",
    "visibility": "private"
  }'
```

---

### PATCH /stations/:id

Update an existing station within the authenticated tenant.

Only the fields included in the request body are updated. Setting `external_id`,
`latitude`, or `longitude` to `null` explicitly clears the stored value. At least
one field must be present.

**Request:**

```json
{
  "name": "Renamed Hub",
  "status": "active"
}
```

**Fields:**

| Field         | Type              | Notes                                                                 |
| ------------- | ----------------- | --------------------------------------------------------------------- |
| `name`        | `string`          | Non-empty, max 255 characters                                         |
| `external_id` | `string \| null`  | Pass `null` to clear                                                  |
| `latitude`    | `number \| null`  | Must be provided together with `longitude`; pass `null` to clear      |
| `longitude`   | `number \| null`  | Must be provided together with `latitude`; pass `null` to clear       |
| `status`      | `string`          | One of `active`, `planning`, `inactive`, `error`                      |
| `visibility`  | `string`          | `public` or `private`                                                 |

**Response (200 OK):**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "tenantId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "name": "Renamed Hub",
  "externalId": "EXT-001",
  "latitude": 48.8566,
  "longitude": 2.3522,
  "status": "active",
  "visibility": "public",
  "createdAt": "2026-02-25T12:00:00.000Z",
  "updatedAt": "2026-02-25T12:30:00.000Z",
  "deletedAt": null
}
```

**Error Scenarios:**

| Status | Error Type   | Reason                                                                         |
| ------ | ------------ | ------------------------------------------------------------------------------ |
| 400    | bad-request  | Empty body, invalid field values, or unpaired lat/lon                          |
| 401    | unauthorized | Missing or invalid Authorization header / expired token                        |
| 404    | not-found    | Station does not exist or belongs to a different tenant                        |
| 500    | internal     | Server error (see logs)                                                        |

**Security note:** A station that exists but belongs to a different tenant returns 404,
not 403. This prevents cross-tenant enumeration of station IDs.

**Example cURL:**

```bash
curl -X PATCH http://localhost:3000/stations/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "active"
  }'
```

---

## Tenant Isolation

Both endpoints use `preHandler: [app.verifyJwt, app.verifyTenant]`:

1. `verifyJwt` — validates the Bearer token and populates `request.jwtUser`
2. `verifyTenant` — extracts `tid` from the JWT and sets `request.tenantId`

The `tenantId` is then passed directly into every database query as a `WHERE tenant_id = ?`
clause. A station belonging to another tenant is indistinguishable from a non-existent
station at the route level.

See [`doc/tenancy.md`](../tenancy.md) for the full tenant context flow.

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

---

## Related Documents

- [`doc/stations/data-model.md`](./data-model.md) — schema reference
- [`doc/stations/repositories.md`](./repositories.md) — repository function reference
- [`doc/tenancy.md`](../tenancy.md) — tenant context middleware

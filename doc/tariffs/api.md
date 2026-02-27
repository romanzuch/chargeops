# Tariffs API Documentation

## Overview

Tariffs define the pricing rules used to calculate the cost of a charging session.
All tariff endpoints are tenant-scoped — there are no public endpoints.

All endpoints require JWT + tenant context. Reads require any tenant role;
writes require `tenant_admin`. There is no delete endpoint: tariffs are soft-deletable
only via database-level operations (intentional — an active tariff being deleted
mid-session could corrupt billing).

**Base auth:** `Authorization: Bearer <accessToken>` + `X-Tenant-Id: <tenantId>`

---

## Response Shape

```json
{
  "id": "d4e5f6a7-b8c9-0123-defg-456789abcdef",
  "tenantId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "name": "Standard Rate",
  "pricePerKwh": 0.35,
  "pricePerMinute": null,
  "pricePerSession": 1.00,
  "currency": "EUR",
  "createdAt": "2026-02-25T12:00:00.000Z",
  "updatedAt": "2026-02-25T12:00:00.000Z",
  "deletedAt": null
}
```

| Field             | Type              | Notes |
|-------------------|-------------------|-------|
| `id`              | `string` (UUID)   | Tariff UUID |
| `tenantId`        | `string` (UUID)   | Owning tenant |
| `name`            | `string`          | Display name |
| `pricePerKwh`     | `number \| null`  | Price per kilowatt-hour |
| `pricePerMinute`  | `number \| null`  | Price per minute of session time |
| `pricePerSession` | `number \| null`  | Flat fee per session |
| `currency`        | `string`          | ISO 4217 3-letter code (e.g., `EUR`, `USD`) |
| `createdAt`       | `string`          | ISO 8601 |
| `updatedAt`       | `string`          | ISO 8601 |
| `deletedAt`       | `string \| null`  | Set when soft-deleted |

All pricing components are independent and additive; a session can be billed using
any combination (e.g., per-kWh + flat session fee).

---

## Endpoints

### GET /tariffs

List all tariffs for the authenticated tenant.

**Query params:** `limit` (default 20, max 100), `offset` (default 0)

**Response (200 OK):**

```json
{
  "data": [ /* TariffResponse[] */ ],
  "total": 5
}
```

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Missing/mismatched `X-Tenant-Id` |

**Example cURL:**

```bash
curl http://localhost:3000/tariffs \
  -H "Authorization: Bearer <accessToken>" \
  -H "X-Tenant-Id: <tenantId>"
```

---

### GET /tariffs/:id

Get a single tariff in the authenticated tenant.

**Response (200 OK):** Single `TariffResponse` object.

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Missing/mismatched tenant |
| 404    | not-found    | Tariff not found in this tenant |

---

### POST /tariffs

Create a new tariff. Requires `tenant_admin` role.

**Request body:**

```json
{
  "name": "Standard Rate",
  "price_per_kwh": 0.35,
  "price_per_session": 1.00,
  "currency": "EUR"
}
```

**Fields:**

| Field               | Type     | Required | Notes |
|---------------------|----------|----------|-------|
| `name`              | `string` | Yes      | Non-empty, max 255 characters |
| `price_per_kwh`     | `number` | No       | Must be ≥ 0 |
| `price_per_minute`  | `number` | No       | Must be ≥ 0 |
| `price_per_session` | `number` | No       | Must be ≥ 0 |
| `currency`          | `string` | No       | Exactly 3 characters (ISO 4217); defaults to tenant/system default |

**Response (201 Created):** Full `TariffResponse` object.

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 400    | bad-request  | Missing `name` or invalid field values |
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Missing/mismatched tenant, or not `tenant_admin` |

**Example cURL:**

```bash
curl -X POST http://localhost:3000/tariffs \
  -H "Authorization: Bearer <accessToken>" \
  -H "X-Tenant-Id: <tenantId>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Standard Rate",
    "price_per_kwh": 0.35,
    "currency": "EUR"
  }'
```

---

### PATCH /tariffs/:id

Update a tariff. Requires `tenant_admin` role. At least one field required.
Pass `null` for pricing fields to clear them.

**Request body:**

```json
{
  "price_per_kwh": 0.40,
  "price_per_session": null
}
```

**Fields:** Same as `POST /tariffs`, all optional. Pricing fields accept `null` to clear.

**Response (200 OK):** Updated `TariffResponse` object.

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 400    | bad-request  | Empty body or invalid values |
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Missing/mismatched tenant, or not `tenant_admin` |
| 404    | not-found    | Tariff not found in this tenant |

**Example cURL:**

```bash
curl -X PATCH http://localhost:3000/tariffs/d4e5f6a7-b8c9-0123-defg-456789abcdef \
  -H "Authorization: Bearer <accessToken>" \
  -H "X-Tenant-Id: <tenantId>" \
  -H "Content-Type: application/json" \
  -d '{ "price_per_kwh": 0.40 }'
```

---

## Related Documents

- [`doc/customer-groups/api.md`](../customer-groups/api.md) — tariffs can be assigned to customer groups
- [`doc/tariff-zones/api.md`](../tariff-zones/api.md) — tariffs can be linked to geographic zones
- [`doc/sessions/api.md`](../sessions/api.md) — sessions resolve a tariff at start time

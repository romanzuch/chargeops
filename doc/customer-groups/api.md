# Customer Groups API Documentation

## Overview

Customer groups allow tenants to segment their users and assign specific pricing
rules (tariffs) or geographic zones (tariff-zones) to them. All endpoints require
JWT + tenant context + the `tenant_admin` role.

**Base auth:** `Authorization: Bearer <accessToken>` + `X-Tenant-Id: <tenantId>`

---

## Response Shape

```json
{
  "id": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
  "tenantId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "name": "Fleet Customers",
  "createdAt": "2026-02-25T12:00:00.000Z",
  "updatedAt": "2026-02-25T12:00:00.000Z"
}
```

| Field       | Type            | Notes |
|-------------|-----------------|-------|
| `id`        | `string` (UUID) | Group UUID |
| `tenantId`  | `string` (UUID) | Owning tenant |
| `name`      | `string`        | Display name |
| `createdAt` | `string`        | ISO 8601 |
| `updatedAt` | `string`        | ISO 8601 |

---

## Endpoints

### GET /customer-groups

List all customer groups for the authenticated tenant.

**Query params:** `limit` (default 20, max 100), `offset` (default 0)

**Response (200 OK):**

```json
{
  "data": [ /* CustomerGroupResponse[] */ ],
  "total": 3
}
```

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Not `tenant_admin`, or missing/mismatched `X-Tenant-Id` |

**Example cURL:**

```bash
curl http://localhost:3000/customer-groups \
  -H "Authorization: Bearer <accessToken>" \
  -H "X-Tenant-Id: <tenantId>"
```

---

### GET /customer-groups/:id

Get a single customer group.

**Response (200 OK):** Single `CustomerGroupResponse` object.

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Not `tenant_admin`, or missing/mismatched tenant |
| 404    | not-found    | Group not found in this tenant |

---

### POST /customer-groups

Create a new customer group.

**Request body:**

```json
{
  "name": "Fleet Customers"
}
```

**Fields:**

| Field  | Type     | Required | Notes |
|--------|----------|----------|-------|
| `name` | `string` | Yes      | Non-empty, max 255 characters |

**Response (201 Created):** Full `CustomerGroupResponse` object.

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 400    | bad-request  | Missing or empty `name` |
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Not `tenant_admin`, or missing/mismatched tenant |

**Example cURL:**

```bash
curl -X POST http://localhost:3000/customer-groups \
  -H "Authorization: Bearer <accessToken>" \
  -H "X-Tenant-Id: <tenantId>" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Fleet Customers" }'
```

---

### PATCH /customer-groups/:id

Update a customer group's name. At least one field required.

**Request body:**

```json
{
  "name": "Premium Fleet Customers"
}
```

**Response (200 OK):** Updated `CustomerGroupResponse` object.

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 400    | bad-request  | Empty body |
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Not `tenant_admin`, or missing/mismatched tenant |
| 404    | not-found    | Group not found in this tenant |

---

## Member Management

### POST /customer-groups/:id/members

Add a user to the customer group.

**Request body:**

```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response (204 No Content):** Empty body.

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 400    | bad-request  | Invalid `user_id` UUID |
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Not `tenant_admin`, or missing/mismatched tenant |
| 404    | not-found    | Customer group not found |

---

### DELETE /customer-groups/:id/members/:userId

Remove a user from the customer group.

**Response (204 No Content):** Empty body.

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Not `tenant_admin`, or missing/mismatched tenant |
| 404    | not-found    | Group not found, or user is not a member of this group |

---

## Tariff Assignments

### POST /customer-groups/:id/tariffs

Assign a tariff to the customer group. The tariff must belong to the same tenant.

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
| 404    | not-found    | Group or tariff not found in this tenant |

---

### DELETE /customer-groups/:id/tariffs/:tariffId

Remove a tariff assignment from the customer group.

**Response (204 No Content):** Empty body.

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Not `tenant_admin`, or missing/mismatched tenant |
| 404    | not-found    | Group not found, or tariff not assigned to this group |

---

## Tariff Zone Assignments

### POST /customer-groups/:id/tariff-zones

Assign a tariff zone to the customer group.

**Request body:**

```json
{
  "tariff_zone_id": "e5f6a7b8-c9d0-1234-efgh-567890bcdef1"
}
```

**Response (204 No Content):** Empty body.

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 400    | bad-request  | Invalid `tariff_zone_id` UUID |
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Not `tenant_admin`, or missing/mismatched tenant |
| 404    | not-found    | Group not found in this tenant |

---

### DELETE /customer-groups/:id/tariff-zones/:zoneId

Remove a tariff zone assignment from the customer group.

**Response (204 No Content):** Empty body.

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Not `tenant_admin`, or missing/mismatched tenant |
| 404    | not-found    | Group not found, or tariff zone not assigned to this group |

---

## Related Documents

- [`doc/tariffs/api.md`](../tariffs/api.md) — tariff management
- [`doc/tariff-zones/api.md`](../tariff-zones/api.md) — tariff zone management
- [`doc/tenant-users/api.md`](../tenant-users/api.md) — user management within a tenant

# Tenant Users API Documentation

## Overview

Tenant user management endpoints let a `tenant_admin` view and update the roles of
users within their own tenant. All endpoints require JWT + tenant context + the
`tenant_admin` role.

**Base auth:** `Authorization: Bearer <accessToken>` + `X-Tenant-Id: <tenantId>`

---

## Endpoints

### GET /tenant/users

List all users who are members of the authenticated tenant, ordered by join date.

**Query params:** `limit` (default 20, max 100), `offset` (default 0)

**Response (200 OK):**

```json
{
  "data": [
    {
      "userId": "550e8400-e29b-41d4-a716-446655440000",
      "email": "alice@example.com",
      "role": "tenant_admin",
      "memberSince": "2026-01-15T10:00:00.000Z"
    },
    {
      "userId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      "email": "bob@example.com",
      "role": "tenant_view",
      "memberSince": "2026-02-01T09:30:00.000Z"
    }
  ],
  "total": 2
}
```

**Fields:**

| Field         | Type     | Notes |
|---------------|----------|-------|
| `userId`      | `string` | User UUID |
| `email`       | `string` | Normalized email address |
| `role`        | `string` | One of `tenant_admin`, `tenant_view`, `driver` |
| `memberSince` | `string` | ISO 8601 timestamp of when the user joined the tenant |

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Not `tenant_admin`, or missing/mismatched `X-Tenant-Id` |

**Example cURL:**

```bash
curl http://localhost:3000/tenant/users \
  -H "Authorization: Bearer <accessToken>" \
  -H "X-Tenant-Id: <tenantId>"
```

---

### PATCH /tenant/users/:userId/role

Update the role of a user within the authenticated tenant.

**Constraints:**
- Allowed target roles: `tenant_admin`, `tenant_view` (the `driver` role cannot be assigned through this endpoint)
- A `tenant_admin` cannot change their own role (`403`)

**Request:**

```
PATCH /tenant/users/6ba7b810-9dad-11d1-80b4-00c04fd430c8/role
Authorization: Bearer <accessToken>
X-Tenant-Id: <tenantId>
Content-Type: application/json
```

```json
{
  "role": "tenant_admin"
}
```

**Fields:**

| Field  | Type     | Required | Notes |
|--------|----------|----------|-------|
| `role` | `string` | Yes      | Must be `tenant_admin` or `tenant_view` |

**Response (200 OK):**

```json
{
  "userId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "email": "bob@example.com",
  "role": "tenant_admin",
  "memberSince": "2026-02-01T09:30:00.000Z"
}
```

**Error Scenarios:**

| Status | Error Type   | Reason |
|--------|--------------|--------|
| 400    | bad-request  | Invalid role value |
| 401    | unauthorized | Missing or invalid token |
| 403    | forbidden    | Not `tenant_admin`, missing/mismatched tenant, or attempting to change own role |
| 404    | not-found    | User not found in this tenant |

**Example cURL:**

```bash
curl -X PATCH http://localhost:3000/tenant/users/6ba7b810-9dad-11d1-80b4-00c04fd430c8/role \
  -H "Authorization: Bearer <accessToken>" \
  -H "X-Tenant-Id: <tenantId>" \
  -H "Content-Type: application/json" \
  -d '{ "role": "tenant_admin" }'
```

---

## Role Transition Rules

| From → To        | Allowed? | Notes |
|------------------|----------|-------|
| `tenant_view` → `tenant_admin` | ✅ | Promotion |
| `tenant_admin` → `tenant_view` | ✅ | Demotion |
| `* → driver`    | ❌ | Out of scope for this endpoint |
| `driver → *`    | ❌ | Out of scope for this endpoint |
| Self → anything  | ❌ | Cannot change your own role |

## Related Documents

- [`doc/rbac.md`](../rbac.md) — full RBAC reference
- [`doc/auth/api.md`](../auth/api.md) — registration and login

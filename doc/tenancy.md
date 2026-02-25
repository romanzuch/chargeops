# Tenant Context

## Overview

Every authenticated request in ChargeOps carries a **tenant ID** (`tid`). This
document explains where the tenant ID comes from, how it is validated, and how
it flows through the system.

---

## Tenant Definition

A *tenant* represents a single organisation or workspace. All resources (charge
points, sessions, users) are scoped to a tenant. The tenant ID is a UUID stored
in the `tenants` table and embedded in every access token at login time.

---

## Sources of Tenant Context

The tenant ID for a request is resolved in the following order:

### 1. JWT Access Token (`tid` claim)

Every access token contains a `tid` claim set at login or token-refresh time.
This is the **authoritative** source of tenant context.

```
Authorization: Bearer eyJ...
                         └─ payload: { "sub": "<userId>", "tid": "<tenantId>", ... }
```

### 2. Optional `x-tenant-id` Header

Non-browser clients may send an explicit `x-tenant-id` header to make the
tenant scope visible at the HTTP layer:

```
x-tenant-id: <tenantId>
```

**Rule**: if the header is present it **must match** the `tid` claim in the
token. A mismatch returns 403 Forbidden immediately.

| Header present? | Matches token `tid`? | Outcome        |
| --------------- | -------------------- | -------------- |
| No              | —                    | Use token `tid` |
| Yes             | Yes                  | 200 OK         |
| Yes             | No                   | 403 Forbidden  |

---

## Implementation

The tenant context is enforced by the `tenantContextPlugin`
(`src/plugins/tenant-context.ts`), which exposes the `app.verifyTenant`
preHandler decorator.

Protected routes include it **after** `app.verifyJwt` in the preHandler chain:

```typescript
app.get('/protected', { preHandler: [app.verifyJwt, app.verifyTenant] }, async (req) => {
  // req.tenantId is guaranteed to be set here
  const tenantId = req.tenantId!;
});
```

After `verifyTenant` runs, `request.tenantId` contains the resolved tenant ID
and the request logger is enriched with `{ tenantId }`, so all subsequent log
calls (including the response completion log) automatically include it.

---

## Error Cases

| Scenario                                | Status | Error type                                       |
| --------------------------------------- | ------ | ------------------------------------------------ |
| No `Authorization` header               | 401    | `https://errors.chargeops.dev/unauthorized`      |
| Invalid or expired JWT                  | 401    | `https://errors.chargeops.dev/unauthorized`      |
| `x-tenant-id` does not match token `tid` | 403  | `https://errors.chargeops.dev/forbidden`         |

All error responses follow the [RFC 9457 Problem Details](https://www.rfc-editor.org/rfc/rfc9457)
format:

```json
{
  "type": "https://errors.chargeops.dev/forbidden",
  "title": "Forbidden",
  "status": 403,
  "detail": "x-tenant-id header does not match token tenant"
}
```

---

## Super Admin Context

Super admins (`is_super_admin = true` in the `users` table) are cross-tenant.
Their JWT contains `tid: null` and `isSuperAdmin: true`. When a super admin
request passes through `verifyTenant`, the check is **skipped entirely** and
`request.tenantId` is set to `null`.

Super admin routes use `app.verifySuperAdmin` instead of `[app.verifyJwt, app.verifyTenant]`:

```typescript
app.post("/admin/tenants", { preHandler: [app.verifySuperAdmin] }, async (req) => {
  // req.jwtUser!.isSuperAdmin === true, req.tenantId === null
});
```

Super admins are created via the seed script — not through the registration
endpoint. See [`doc/rbac.md`](./rbac.md) for details.

---

## Public Routes (Bypass)

The following routes do **not** include `verifyTenant` and require no tenant
context:

| Route                 | Reason                                          |
| --------------------- | ----------------------------------------------- |
| `GET /health`         | Liveness probe — no auth                        |
| `GET /tenants`        | Public tenant listing for registration form     |
| `POST /auth/register` | Creates a user account (tenant chosen in body)  |
| `POST /auth/login`    | Issues tokens                                   |
| `POST /auth/refresh`  | Rotates tokens                                  |
| `POST /auth/logout`   | Revokes tokens                                  |

---

## Logging

For every request that passes through `verifyTenant`, the Pino child logger is
enriched:

```json
{ "tenantId": "<uuid>", "reqId": "req-...", ... }
```

This means `tenantId` appears in all log lines emitted after the preHandler
runs — route handlers, service calls, and the response completion log.

Public routes that bypass `verifyTenant` will not have `tenantId` in their logs,
which is expected.

---

## Future: Multi-Tenant Switching

The current implementation is **single-tenant per token** — the `tid` in the
JWT determines the tenant for the lifetime of the token. Future work may allow:

- A token exchange endpoint that issues a new token scoped to a different tenant
  after verifying cross-tenant membership (for users who belong to multiple tenants)

Super admin cross-tenant access is already implemented via `isSuperAdmin: true`
and `tid: null` in the JWT.

---

## Related Documents

- [`doc/auth/jwt.md`](./auth/jwt.md) — access token signing and verification
- [`doc/auth/data-model.md`](./auth/data-model.md) — schema reference
- [`src/plugins/tenant-context.ts`](../src/plugins/tenant-context.ts) — implementation

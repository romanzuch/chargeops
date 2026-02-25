# Role-Based Access Control (RBAC)

## Overview

ChargeOps uses a two-tier RBAC model:

1. **Super admins** — system-level users with cross-tenant access. They create
   tenants and manage the platform.
2. **Tenant users** — scoped to a single tenant. Their role determines what they
   can do within that tenant.

Roles are stored in the `user_tenant_roles` table (for tenant users) or as a
flag on the `users` table (for super admins).

---

## Role Reference

| Role           | Scope       | Typical Capabilities                                        |
| -------------- | ----------- | ----------------------------------------------------------- |
| `super_admin`  | Cross-tenant | Create / list tenants, access all data across all tenants  |
| `tenant_admin` | Own tenant  | Manage stations, manage users within their tenant           |
| `tenant_view`  | Own tenant  | Read-only access to their tenant's data (incl. private stations) |
| `driver`       | Own tenant  | Read tenant data + write access to charging sessions (future) |

---

## Super Admin

### Creation

Super admins are not created via the registration endpoint. They are seeded
using the `scripts/seed-super-admin.ts` script:

```bash
SUPER_ADMIN_EMAIL=admin@example.com \
SUPER_ADMIN_PASSWORD=YourStrongPass123! \
  npx tsx scripts/seed-super-admin.ts
```

The script is **idempotent** — it skips if the email already exists. Password
must meet the standard 12-character minimum.

### JWT Behaviour

Super admin access tokens have:

- `tid: null` — no tenant scope
- `isSuperAdmin: true`

```json
{
  "sub": "9a8b7c6d-5e4f-3210-fedc-ba9876543210",
  "tid": null,
  "isSuperAdmin": true,
  "jti": "...",
  "iat": 1700000000,
  "exp": 1700000900
}
```

Refresh tokens for super admins also have `tenant_id = NULL` in the database.

### Protecting Routes

Use `app.verifySuperAdmin` as the preHandler. It combines JWT verification with
the super admin check and throws `403 ForbiddenError` if the user is not a
super admin.

```typescript
// src/routes/admin.ts
app.post("/admin/tenants", { preHandler: [app.verifySuperAdmin] }, async (req, reply) => {
  // Only super admins reach here
});
```

Do **not** combine `verifySuperAdmin` with `verifyTenant` — super admins have
no tenant context.

---

## Tenant Users

### Registration

A user self-registers by choosing an existing tenant from `GET /tenants` and
providing the `tenantId` in the registration request:

```bash
# 1. List tenants
curl http://localhost:3000/tenants

# 2. Register
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "MySecurePassword123",
    "tenantId": "<tenantId from step 1>"
  }'
```

New registrations are always assigned `tenant_view`. A `tenant_admin` can
promote them afterward (promotion endpoint is a future feature).

### JWT Behaviour

Tenant user access tokens have:

- `tid`: the tenant UUID
- `isSuperAdmin: false`

```json
{
  "sub": "3f4e5d6c-7b8a-9012-3c4d-5e6f7a8b9c0d",
  "tid": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "isSuperAdmin": false,
  "jti": "...",
  "iat": 1700000000,
  "exp": 1700000900
}
```

### Protecting Routes

Use `[app.verifyJwt, app.verifyTenant]` for routes that require tenant context:

```typescript
app.post("/stations", { preHandler: [app.verifyJwt, app.verifyTenant] }, async (req) => {
  const tenantId = req.tenantId!; // guaranteed non-null for tenant users
  // role check can be added here in the handler or as a dedicated preHandler
});
```

---

## Permission Matrix

Current route-level enforcement:

| Endpoint               | super_admin | tenant_admin | tenant_view | driver | unauthenticated |
| ---------------------- | :---------: | :----------: | :---------: | :----: | :-------------: |
| `GET /health`          | ✓           | ✓            | ✓           | ✓      | ✓               |
| `GET /tenants`         | ✓           | ✓            | ✓           | ✓      | ✓               |
| `POST /auth/register`  | ✓           | ✓            | ✓           | ✓      | ✓               |
| `POST /auth/login`     | ✓           | ✓            | ✓           | ✓      | ✓               |
| `POST /auth/refresh`   | ✓           | ✓            | ✓           | ✓      | ✓               |
| `POST /auth/logout`    | ✓           | ✓            | ✓           | ✓      | ✓               |
| `GET /me`              | ✓           | ✓            | ✓           | ✓      | ✗               |
| `GET /stations`        | ✓           | ✓            | ✓           | ✓      | ✓ (public only) |
| `GET /stations/:id`    | ✓           | ✓            | ✓           | ✓      | ✓ (public only) |
| `POST /stations`       | ✓           | ✓            | ✗           | ✗      | ✗               |
| `PATCH /stations/:id`  | ✓           | ✓            | ✗           | ✗      | ✗               |
| `GET /admin/tenants`   | ✓           | ✗            | ✗           | ✗      | ✗               |
| `POST /admin/tenants`  | ✓           | ✗            | ✗           | ✗      | ✗               |

> **Note:** Route-level role enforcement for `tenant_view` / `driver` on station
> write endpoints is not yet implemented as a preHandler — it relies on the
> `tenant_id` scoping in the repository layer. A dedicated `verifyRole` preHandler
> factory is a future improvement.

---

## Related Documents

- [`doc/auth/jwt.md`](./auth/jwt.md) — JWT claims reference
- [`doc/auth/api.md`](./auth/api.md) — Auth endpoint reference
- [`doc/tenancy.md`](./tenancy.md) — Tenant context and `verifyTenant`
- [`doc/auth/data-model.md`](./auth/data-model.md) — Database schema
- [`src/plugins/jwt-auth.ts`](../src/plugins/jwt-auth.ts) — `verifyJwt` / `verifySuperAdmin`
- [`scripts/seed-super-admin.ts`](../scripts/seed-super-admin.ts) — Super admin seed script

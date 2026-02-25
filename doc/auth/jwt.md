# JWT Access Token Service

## Overview

Access tokens are short-lived JWTs signed with HS256 (HMAC-SHA256). They are
issued alongside a refresh token and authorize API calls within a single tenant
scope. Verification is handled centrally by the `verifyJwt` Fastify preHandler.

---

## Claims

| Claim          | Type              | Description                                                    |
| -------------- | ----------------- | -------------------------------------------------------------- |
| `sub`          | `string`          | Subject — authenticated user ID (UUID)                         |
| `tid`          | `string \| null`  | Tenant ID — tenant scope for this token. `null` for super admins (cross-tenant). |
| `isSuperAdmin` | `boolean`         | `true` for super admins; `false` for all tenant-scoped users.  |
| `jti`          | `string`          | JWT ID — UUID, unique per token                                |
| `iat`          | `number`          | Issued-at (seconds since epoch, set by issuer)                 |
| `exp`          | `number`          | Expiry (seconds since epoch)                                   |

All claims are **required**. `verifyAccessToken` throws `UnauthorizedError`
for any token that is missing or contains the wrong type for any of them.
`tid` may be `null` (valid for super admins) but must not be an empty string.

### Example decoded payload — tenant user

```json
{
  "sub": "3f4e5d6c-7b8a-9012-3c4d-5e6f7a8b9c0d",
  "tid": "a1b2c3d4-e5f6-7890-ab12-cd34ef567890",
  "isSuperAdmin": false,
  "jti": "550e8400-e29b-41d4-a716-446655440000",
  "iat": 1700000000,
  "exp": 1700000900
}
```

### Example decoded payload — super admin

```json
{
  "sub": "9a8b7c6d-5e4f-3210-fedc-ba9876543210",
  "tid": null,
  "isSuperAdmin": true,
  "jti": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "iat": 1700000000,
  "exp": 1700000900
}
```

---

## Algorithm

| Setting   | Value                                              |
| --------- | -------------------------------------------------- |
| Algorithm | `HS256` (HMAC-SHA256)                              |
| Library   | [`jose`](https://github.com/panva/jose) v6         |
| Key       | `JWT_SECRET` env var (min 32 chars)                |
| TTL       | `JWT_ACCESS_TTL_SECONDS` (default: `900` = 15 min) |

### Environment variables

```
# Required when JWT auth is in use
JWT_SECRET=<random-hex-min-32-chars>

# Optional, defaults to 900 seconds (15 minutes)
JWT_ACCESS_TTL_SECONDS=900
```

Generate a secure secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Sign / Verify API

### `signAccessToken(input, secret, ttlSeconds): Promise<string>`

Located in `src/services/jwt.service.ts`.

```typescript
import { signAccessToken } from "./services/jwt.service.js";

// Tenant user
const token = await signAccessToken(
  { userId: "...", tenantId: "...", isSuperAdmin: false },
  config.jwtSecret!,
  config.jwtAccessTtlSeconds,
);

// Super admin (no tenant)
const token = await signAccessToken(
  { userId: "...", tenantId: null, isSuperAdmin: true },
  config.jwtSecret!,
  config.jwtAccessTtlSeconds,
);
```

Returns a compact JWS string (`header.payload.signature`).

---

### `verifyAccessToken(token, secret): Promise<AccessTokenPayload>`

```typescript
import { verifyAccessToken } from "./services/jwt.service.js";

const payload = await verifyAccessToken(token, config.jwtSecret!);
// payload: { sub, tid, jti, iat, exp }
```

**Throws** `UnauthorizedError` in these cases:

| Condition     | Message                            |
| ------------- | ---------------------------------- |
| Token expired | `"Token expired"`                  |
| Bad signature | `"Invalid token"`                  |
| Malformed JWT | `"Invalid token"`                  |
| Missing claim | `"Invalid token: missing <claim>"` |

---

## Central Validation — `verifyJwt` Plugin

`src/plugins/jwt-auth.ts` registers two decorators (via `fastify-plugin` to
escape encapsulation):

| Decorator              | Type                         | Description                                              |
| ---------------------- | ---------------------------- | -------------------------------------------------------- |
| `request.jwtUser`      | `AccessTokenPayload \| null` | Populated after `verifyJwt` (or `verifySuperAdmin`) runs |
| `app.verifyJwt`        | `preHandler`                 | Extracts + verifies the Bearer token (any user)          |
| `app.verifySuperAdmin` | `preHandler`                 | Verifies Bearer token AND asserts `isSuperAdmin === true` |

### Using `verifyJwt` on a route (any authenticated user)

```typescript
app.get("/api/resource", { preHandler: [app.verifyJwt] }, async (req) => {
  const { sub: userId, tid: tenantId, isSuperAdmin } = req.jwtUser!;
  // ...
});
```

### Using `verifySuperAdmin` on a route (super admins only)

```typescript
app.post("/admin/tenants", { preHandler: [app.verifySuperAdmin] }, async (req) => {
  // Only reachable by super admins — ForbiddenError thrown otherwise
});
```

### Error responses

The `verifyJwt` preHandler throws typed `AppError` subclasses, which are
serialised by `errorHandlerPlugin` into RFC 9457 Problem Details:

| Condition                         | HTTP status | Error type     |
| --------------------------------- | ----------- | -------------- |
| No / malformed `Authorization`    | `401`       | `unauthorized` |
| Expired token                     | `401`       | `unauthorized` |
| Invalid / tampered token          | `401`       | `unauthorized` |
| `JWT_SECRET` not set (server bug) | `500`       | `internal`     |

Tenant mismatch (e.g. accessing resources belonging to a different tenant)
should be checked at the route/service layer and return `403 ForbiddenError`.
The access token carries `tid` for exactly this purpose.

---

## Rotation Strategy (Outlook — RS256)

Sprint 2 uses HS256 with a single shared secret. For future key rotation:

1. **Move to RS256** — sign with a private key, verify with the public key.
   Routes only ever see the public key; the private key stays isolated in a
   signing service.
2. **Key ID (`kid`)** — include `kid` in the JWT header. Verification looks up
   the matching public key in a JWKS endpoint or local key store.
3. **Rolling rotation** — issue new keys with a new `kid`, keep the old public
   key for verification until all tokens signed with it have expired (max
   `JWT_ACCESS_TTL_SECONDS`), then remove it.
4. **`jose`** already supports RS256 and JWKS out of the box — migration
   requires only changing `signAccessToken` / `verifyAccessToken`; the Fastify
   plugin and all route code remain unchanged.

# Authentication API Documentation

## Overview

The ChargeOps authentication system provides secure user registration, login, and token management for multi-tenant access. It implements industry-standard practices:

- **Access Tokens**: Short-lived JWT (15 minutes by default)
- **Refresh Tokens**: Long-lived tokens with family-based rotation & replay attack detection
- **HttpOnly Cookies**: Secure, same-site cookies prevent XSS token theft
- **Password Hashing**: OWASP-compliant Argon2id with configurable parameters
- **Rate Limiting**: Hook points reserved for future implementation

## Architecture

### Token Lifecycle

1. **Registration/Login**
   - User provides email + password
   - Password is hashed with Argon2id (>100ms per attempt)
   - Access token issued (JWT, signed with HS256)
   - Refresh token generated (32 bytes, base64url encoded)
   - Refresh token hashed (SHA256) and stored in DB with expiry

2. **Token Refresh**
   - Client sends expired/expiring access token with refresh token
   - Refresh token validated (must be non-revoked and within expiry)
   - Old token marked revoked, new token issued (same family)
   - Replay attack detection: if old token replayed, entire family revoked
   - New access token issued

3. **Logout**
   - Refresh token family is revoked
   - All tokens from same login session become invalid
   - Browser cookie cleared

### Multi-Tenant Design

Each token embeds:

- `sub`: User ID (UUID)
- `tid`: Tenant ID (UUID) — multi-tenant scoping. `null` for super admins.
- `isSuperAdmin`: `true` for super admins; `false` for all tenant-scoped users.
- `jti`: Unique token ID — enables future per-token revocation
- `iat`: Issued-at timestamp
- `exp`: Expiration time

## Endpoints

### POST /auth/register

Register a new user and join an existing tenant.

Before calling this endpoint, fetch the tenant list from `GET /tenants` to
obtain a valid `tenantId`.

**Request:**

```json
{
  "email": "user@example.com",
  "password": "MySecurePassword123",
  "tenantId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "name": "Full Name (optional)"
}
```

**Validation:**

- `email`: Must be valid email format (lowercase normalized)
- `password`: Minimum 12 characters
- `tenantId`: Must be a valid UUID of an existing tenant
- `name`: Max 255 characters (optional, reserved for display names)

The user is assigned the `tenant_view` role by default. A `tenant_admin` can
promote them later.

**Response (201 Created):**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900
}
```

**Cookie Set:**

```
Set-Cookie: REFRESH_TOKEN=<base64url>; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000
```

**Error Scenarios:**

| Status | Error Type  | Reason                                          |
| ------ | ----------- | ----------------------------------------------- |
| 400    | bad-request | Invalid email, weak password, missing/invalid tenantId |
| 404    | not-found   | `tenantId` does not match any existing tenant   |
| 409    | conflict    | Email already registered                        |
| 500    | internal    | Server error (see logs)                         |

**Example cURL:**

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "MySecurePassword123",
    "tenantId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "name": "John Doe"
  }'
```

---

### POST /auth/login

Authenticate a user and establish a session.

**Request:**

```json
{
  "email": "user@example.com",
  "password": "MySecurePassword123"
}
```

**Validation:**

- Both email and password required
- Email normalized to lowercase for lookup

**Response (200 OK):**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900
}
```

**Cookie Set:**

```
Set-Cookie: REFRESH_TOKEN=<base64url>; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000
```

**Error Scenarios:**

| Status | Error Type   | Reason                                     |
| ------ | ------------ | ------------------------------------------ |
| 400    | bad-request  | Validation failed (missing fields)         |
| 401    | unauthorized | Invalid credentials (generic for security) |
| 500    | internal     | Server error                               |

**Security Note:** Error response is intentionally generic ("Invalid credentials") for both non-existent users and wrong passwords — this prevents email enumeration attacks.

**Example cURL:**

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "MySecurePassword123"
  }'
```

---

### POST /auth/refresh

Refresh an expired or expiring access token.

**Request (Option 1 - Cookie, Automatic):**

```
POST /auth/refresh
Cookie: REFRESH_TOKEN=<base64url>
```

**Request (Option 2 - Body, Non-Browser Clients):**

```json
{
  "refreshToken": "<base64url>"
}
```

Only include in body if:

- Not using cookies (e.g., mobile client, API gateway)
- `REFRESH_TOKEN_IN_BODY=true` environment variable is set

**Response (200 OK):**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900
}
```

**Cookie Set (Rotated):**

```
Set-Cookie: REFRESH_TOKEN=<NEW_base64url>; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000
```

The new refresh token has the same `family_id` but different token bytes (rotation).

**Error Scenarios:**

| Status | Error Type   | Reason                                              |
| ------ | ------------ | --------------------------------------------------- |
| 400    | bad-request  | Missing refresh token (no cookie, no body)          |
| 401    | unauthorized | Token invalid, expired, revoked, or replay detected |
| 500    | internal     | Server error                                        |

**Replay Attack Detection:**

If a refreshed token is used again:

1. Database transaction detects `revoked_at` is not null
2. Entire token family is revoked durably
3. Error thrown with explicit "Refresh token reuse detected" detail
4. Subsequent refresh attempts fail (all family members revoked)

This forces re-authentication on the suspected-compromised client.

**Example cURL (with cookie):**

```bash
curl -X POST http://localhost:3000/auth/refresh \
  -b "REFRESH_TOKEN=<token>" \
  -H "Accept: application/json"
```

---

### POST /auth/logout

Log out a user and revoke their refresh token family.

**Request (Option 1 - Cookie, Automatic):**

```
POST /auth/logout
Cookie: REFRESH_TOKEN=<base64url>
```

**Request (Option 2 - Body, Non-Browser Clients):**

```json
{
  "refreshToken": "<base64url>"
}
```

**Response (204 No Content):**

```
(empty body)
```

**Cookie Cleared:**

```
Set-Cookie: REFRESH_TOKEN=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0
```

**Effect:**

- Entire refresh token family is revoked in database
- All tokens from the same login session become invalid
- Forces re-authentication on all other devices/tabs

**Error Scenarios:**

| Status | Error Type   | Reason                           |
| ------ | ------------ | -------------------------------- |
| 400    | bad-request  | Missing refresh token            |
| 401    | unauthorized | Invalid or already-revoked token |
| 500    | internal     | Server error                     |

**Example cURL:**

```bash
curl -X POST http://localhost:3000/auth/logout \
  -b "REFRESH_TOKEN=<token>"
```

---

### GET /me

Get current authenticated user's profile (protected endpoint).

**Request:**

```
GET /me
Authorization: Bearer <accessToken>
```

**Response (200 OK) — tenant user:**

```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "tenantId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "role": "tenant_view"
}
```

**Response (200 OK) — super admin:**

```json
{
  "userId": "9a8b7c6d-5e4f-3210-fedc-ba9876543210",
  "email": "admin@example.com",
  "tenantId": null,
  "role": "super_admin"
}
```

**Fields:**

- `userId`: User's UUID
- `email`: User's registered email (lowercase)
- `tenantId`: Current tenant scope (from JWT `tid` claim). `null` for super admins.
- `role`: User's role — one of `super_admin`, `tenant_admin`, `tenant_view`, `driver`

**Error Scenarios:**

| Status | Error Type   | Reason                                                        |
| ------ | ------------ | ------------------------------------------------------------- |
| 401    | unauthorized | Missing/malformed Authorization header, invalid/expired token |
| 500    | internal     | Server error                                                  |

**Example cURL:**

```bash
curl -X GET http://localhost:3000/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

---

### GET /tenants

List all tenants. **Public — no authentication required.**

Used by registration forms to let users pick which tenant to join.

**Response (200 OK):**

```json
[
  { "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479", "name": "Acme Corp" },
  { "id": "a0000000-0000-4000-8000-000000000000", "name": "Another Org" }
]
```

**Example cURL:**

```bash
curl http://localhost:3000/tenants
```

---

### GET /admin/tenants

List all tenants with creation timestamps. **Super admin only.**

**Request:**

```
GET /admin/tenants
Authorization: Bearer <superAdminAccessToken>
```

**Response (200 OK):**

```json
[
  {
    "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "name": "Acme Corp",
    "createdAt": "2026-02-25T12:00:00.000Z"
  }
]
```

**Error Scenarios:**

| Status | Error Type  | Reason                              |
| ------ | ----------- | ----------------------------------- |
| 401    | unauthorized | No / invalid Bearer token          |
| 403    | forbidden   | Authenticated but not a super admin |

---

### POST /admin/tenants

Create a new tenant. **Super admin only.**

**Request:**

```json
{
  "name": "Acme Corp"
}
```

**Response (201 Created):**

```json
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "name": "Acme Corp",
  "createdAt": "2026-02-25T12:00:00.000Z"
}
```

**Error Scenarios:**

| Status | Error Type  | Reason                              |
| ------ | ----------- | ----------------------------------- |
| 400    | bad-request | Missing or empty `name`             |
| 401    | unauthorized | No / invalid Bearer token          |
| 403    | forbidden   | Authenticated but not a super admin |

**Example cURL:**

```bash
curl -X POST http://localhost:3000/admin/tenants \
  -H "Authorization: Bearer <superAdminToken>" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Acme Corp" }'
```

---

## Error Response Format

All errors follow RFC 9457 "Problem Details for HTTP APIs".

**Example:**

```json
{
  "type": "https://errors.chargeops.dev/bad-request",
  "title": "Bad Request",
  "status": 400,
  "detail": "Password must be at least 12 characters",
  "instance": "/auth/register",
  "traceId": "req-550e8400-e29b-41d4-a716-446655440000"
}
```

**Standard Problem Details Fields:**

- `type`: Machine-readable error category URI
- `title`: Human-readable error classification
- `status`: HTTP status code (also in response header)
- `detail`: Specific error message (safe for user display)
- `instance`: Request URL path
- `traceId`: Request correlation ID for server logs

For validation errors, an additional `errors` field may be present (maps field names to error messages).

---

## Cookie Configuration

### Development vs. Production

**Development (`NODE_ENV=development`):**

```
Set-Cookie: REFRESH_TOKEN=<token>; Path=/; HttpOnly; Secure=false; SameSite=Strict; Max-Age=2592000
```

- `Secure=false` allows http://localhost testing in dev tools

**Production (`NODE_ENV=production`):**

```
Set-Cookie: REFRESH_TOKEN=<token>; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000
```

- `Secure=true` requires HTTPS (enforced by browsers)
- Prevents man-in-the-middle interception

### Configuration

| Env Var                   | Default             | Purpose                                                  |
| ------------------------- | ------------------- | -------------------------------------------------------- |
| `NODE_ENV`                | `development`       | Determines `Secure` flag (production=true)               |
| `JWT_REFRESH_TTL_SECONDS` | `2592000` (30 days) | Cookie max-age / token expiry                            |
| `REFRESH_TOKEN_IN_BODY`   | `false`             | Include refresh token in JSON body (non-browser clients) |

---

## Rate Limiting

**Status:** Hook points reserved; not implemented yet.

The following endpoints have reserved preHandler hook positions for future rate limiting:

```typescript
// Future implementation pattern:
POST / auth / register; // rateLimitPlugin("auth:register", { points: 5, duration: 3600 })
POST / auth / login; // rateLimitPlugin("auth:login", { points: 10, duration: 300 })
POST / auth / refresh; // rateLimitPlugin("auth:refresh", { points: 20, duration: 60 })
POST / auth / logout; // (typically not rate-limited)
```

## Security Considerations

### Password Storage

- Argon2id hashing (OWASP-compliant)
- Memory cost: 19 MiB (OWASP minimum)
- ~100-200ms per hash operation (detrimental to brute force)

### Token Security

- Access tokens: 15-minute TTL (short to limit exposure)
- Refresh tokens: 30-day TTL (long-lived but revocable)
- SHA256 hashing for token storage (plaintext never persisted)
- Timing-safe comparison for token verification

### Replay Attack Prevention

- Token family tracking: each login session has unique `family_id`
- On refresh: old token marked revoked, new token has same family
- On replay: when old token used, entire family revoked
- Durability: family revocation committed before throwing error

### Information Leakage Prevention

- Generic "Invalid credentials" for both non-existent users and bad passwords
- No email enumeration possible
- Error details redacted in logs (Authorization header not logged)

### Cookie Security

- `HttpOnly`: Prevents JavaScript access (XSS protection)
- `Secure`: Only sent over HTTPS in production
- `SameSite=Strict`: Prevents CSRF attacks (no cross-site cookie submission)
- Path-restricted to `/` (available to all endpoints)

---

## Testing

### Unit Tests

Location: `/test/unit/`

- Schemas validation: `/test/unit/http/schemas/auth.schemas.test.ts`
- Service logic: `/test/unit/services/auth.service.test.ts` (mocked DB)

Run:

```bash
npm test -- test/unit/services/auth.service.test.ts
npm test -- test/unit/http/schemas/auth.schemas.test.ts
```

### Integration Tests

Location: `/test/integration/routes/auth.test.ts`

- Full endpoint testing with real database
- Cookie handling and rotation
- Replay attack detection
- All error scenarios

Run:

```bash
npm test:integration -- test/integration/routes/auth.test.ts
```

---

## Environment Variables

Add to `.env` or `.env.production`:

```bash
# JWT Configuration
JWT_SECRET=your-secret-key-at-least-32-characters-minimum

# Token TTLs (in seconds)
JWT_ACCESS_TTL_SECONDS=900              # 15 minutes
JWT_REFRESH_TTL_SECONDS=2592000         # 30 days

# Cookie behavior
REFRESH_TOKEN_IN_BODY=false             # include refresh in JSON body?

# Auto-detected from NODE_ENV:
# - development: Secure=false (allow http://localhost)
# - production: Secure=true (require HTTPS)
```

Defaults are suitable for both development and production; only `JWT_SECRET` is required in non-test environments.

---

## Future Enhancements

1. **Rate Limiting** — Implement hook points (POST /auth/register, /auth/login)
2. **Multi-Tenant Login** — Allow user to select tenant at login when they belong to multiple tenants
3. **OAuth/OIDC** — Third-party provider integration
4. **Audit Logging** — Track login/logout events per tenant
5. **Session Management** — View/revoke specific sessions (device tracking)
6. **Password Reset** — Email-based recovery flow
7. **2FA/MFA** — TOTP or WebAuthn support
8. **OpenAPI** — Swagger/Redoc documentation (generated from schemas)
9. **Role Promotion** — Endpoint for `tenant_admin` to promote users within their tenant

---

## References

- RFC 7519: JSON Web Tokens (JWT)
- RFC 9457: Problem Details for HTTP APIs
- OWASP: Authentication Cheat Sheet
- OWASP: Password Storage Cheat Sheet

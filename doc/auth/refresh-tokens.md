# Refresh Token Rotation

## Overview

Refresh tokens are **opaque random values** (not JWTs). They are used to obtain
new access tokens without asking the user to log in again. The raw token value
is never stored — only its SHA-256 hash is persisted in the database.

| Property   | Value                                                                       |
| ---------- | --------------------------------------------------------------------------- |
| Format     | 32 random bytes encoded as base64url                                        |
| Storage    | SHA-256 hex hash in `refresh_tokens.token_hash`                             |
| Transport  | HttpOnly cookie (`REFRESH_TOKEN`), or body if `REFRESH_TOKEN_IN_BODY=true` |
| TTL        | `JWT_REFRESH_TTL_SECONDS` (default: 30 days)                                |
| Rotation   | Every use — old token is revoked, new token issued                          |
| Reuse policy | Detected replay → entire token family revoked                             |

---

## Token Lifecycle

### Happy path

```
Client                          Server                         DB
  │                               │                             │
  │── POST /auth/login ──────────>│                             │
  │                               │── INSERT refresh_tokens ───>│
  │                               │   (family_id = new UUID)    │
  │<── 200 accessToken ───────────│                             │
  │    Set-Cookie: REFRESH_TOKEN  │                             │
  │                               │                             │
  │   ... access token expires ...│                             │
  │                               │                             │
  │── POST /auth/refresh ────────>│                             │
  │   Cookie: REFRESH_TOKEN=T1    │── SELECT … FOR UPDATE ─────>│
  │                               │   (lock token row)          │
  │                               │── UPDATE revoked_at=now() ─>│  (T1 revoked)
  │                               │── INSERT new token T2 ─────>│  (same family_id)
  │<── 200 accessToken ───────────│                             │
  │    Set-Cookie: REFRESH_TOKEN=T2                             │
  │                               │                             │
  │── POST /auth/refresh ────────>│                             │
  │   Cookie: REFRESH_TOKEN=T2    │── SELECT … FOR UPDATE ─────>│
  │                               │── UPDATE revoked_at=now() ─>│  (T2 revoked)
  │                               │── INSERT new token T3 ─────>│  (same family_id)
  │<── 200 accessToken ───────────│                             │
  │    Set-Cookie: REFRESH_TOKEN=T3                             │
```

Every successful refresh:

1. Locks the old token row with `SELECT … FOR UPDATE` to eliminate TOCTOU races.
2. Marks the old token revoked (`revoked_at = now()`).
3. Inserts a new token with the **same `family_id`** and a fresh `token_hash`.
4. All three steps run inside a single database transaction.

### Logout

```
Client                          Server                         DB
  │                               │                             │
  │── POST /auth/logout ─────────>│                             │
  │   Cookie: REFRESH_TOKEN=T3    │── hash(T3) ─────────────── │
  │                               │── find token ──────────────>│
  │                               │── revokeByFamily(family_id)>│  (all tokens in chain)
  │<── 204 No Content ────────────│                             │
  │    Set-Cookie: REFRESH_TOKEN= │                             │
  │    (cleared, Max-Age=0)       │                             │
```

Logout revokes the **entire token family**, not just the current token. This
ensures that if the user has multiple active tabs or the current token was
already rotated by a concurrent request, all derived tokens are also
invalidated.

---

## Reuse Detection (Replay Attack)

If an attacker steals a refresh token and uses it _after_ the legitimate client
has already rotated it, the stolen token appears in the DB with
`revoked_at IS NOT NULL`. The server detects this as a replay.

```
Legitimate client               Attacker                Server              DB
       │                           │                       │                 │
       │── POST /auth/refresh ────────────────────────────>│                 │
       │   Cookie: T1              │                       │── lock T1 ─────>│
       │                           │                       │── revoke T1 ────>│
       │                           │                       │── insert T2 ────>│
       │<── 200 T2 ────────────────────────────────────────│                 │
       │                           │                       │                 │
       │                           │── POST /auth/refresh ─>│                 │
       │                           │   Cookie: T1 (stolen)  │── lock T1 ─────>│
       │                           │                        │   revoked_at ≠ NULL
       │                           │                        │── revokeByFamily>│ (T1, T2, …)
       │                           │<── 401 Unauthorized ───│                 │
       │                           │                        │                 │
       │── POST /auth/refresh ────────────────────────────>│                 │
       │   Cookie: T2              │                        │── lock T2 ─────>│
       │                           │                        │   revoked_at ≠ NULL
       │                           │                        │<── 401 ─────────│
```

**Consequence for both parties:** after a replay is detected, the entire token
family is revoked. Both the attacker _and_ the legitimate client receive 401 on
their next request and must re-authenticate. This is intentional — it is the
only safe response when token theft cannot be ruled out.

### Implementation detail

The key insight is that `revokeByFamily` must be **durably committed** even
when a replay is detected. If it were rolled back, the attacker could keep
replaying indefinitely. `rotateRefreshToken` therefore uses flag variables
to defer throwing until _after_ the transaction commits:

```typescript
// src/repositories/refresh-tokens.repo.ts
let replayDetected = false;

const result = await db.transaction().execute(async (trx) => {
  const old = await trx
    .selectFrom("refresh_tokens")
    .where("token_hash", "=", oldTokenHash)
    .forUpdate()                              // serialises concurrent refreshes
    .executeTakeFirst();

  if (old.revoked_at !== null) {
    await revokeByFamily(trx, old.family_id); // committed ✓
    replayDetected = true;
    return null;
  }
  // … revoke old, insert new …
});

if (replayDetected) {
  throw new UnauthorizedError("Refresh token reuse detected"); // thrown after commit
}
```

---

## Database Schema

```sql
CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  family_id   uuid NOT NULL,
  token_hash  text NOT NULL,
  expires_at  timestamptz NOT NULL CHECK (expires_at > created_at),
  revoked_at  timestamptz NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

### Field rationale

| Column       | Rationale                                                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `token_hash` | SHA-256 hex of the raw base64url value. The raw token is never stored — a DB breach exposes only hashes, which cannot be reversed to forge cookies.                                       |
| `family_id`  | Groups all tokens issued from one login session. Enables revoking the entire chain on logout or replay detection without scanning the whole table.                                         |
| `revoked_at` | `NULL` = active. Non-null = revoked (by logout, replay detection, or explicit invalidation). Rows are **never deleted** — the row must survive to detect replays against rotated tokens.  |
| `expires_at` | Hard expiry enforced at the query level. `findValidRefreshTokenByHash` filters `expires_at > now()` so expired tokens are never accepted even if `revoked_at` is still null.              |
| `tenant_id`  | Carried into the new access token during rotation, avoiding an extra `users` join and tying the token to a specific tenant context.                                                       |
| `user_id`    | Used by `revokeAllForUser` (global logout / account compromise response) and for ON DELETE CASCADE when a user is removed.                                                                |

### Why rows are never deleted

Deleting a revoked token would make replay detection impossible — the server
would have no record that the token ever existed and would treat the replayed
token as simply unknown (returning a generic 401 with no family revocation).
Rows should be purged by a background job only after
`expires_at + safety_margin` has passed, guaranteeing the token can no longer
be presented by any client.

### Indexes

| Index                                   | Purpose                                                               |
| --------------------------------------- | --------------------------------------------------------------------- |
| `refresh_tokens_token_hash_idx`         | O(1) lookup by hash on every refresh/logout request                  |
| `refresh_tokens_family_id_idx`          | Fast `WHERE family_id = ?` scan for `revokeByFamily`                 |
| `refresh_tokens_user_tenant_active_idx` | Partial index (`WHERE revoked_at IS NULL`) for listing active sessions per user |

---

## Token Hashing

```
raw token    = randomBytes(32)              → 256 bits of entropy
client value = raw.toString("base64url")    → sent in cookie / body
db value     = sha256(raw).hex()            → stored in token_hash
```

On every request the server re-hashes the incoming base64url value and queries
by the resulting hex string. No timing-safe comparison is needed at this layer
because the lookup is a DB equality check, not a direct string comparison in
application code.

The SHA-256 hash provides one-way protection: even with full read access to the
`refresh_tokens` table an attacker cannot derive the raw cookie value from the
stored hash.

---

## Environment Variables

```
# Refresh token lifetime in seconds (default: 2592000 = 30 days)
JWT_REFRESH_TTL_SECONDS=2592000

# Set to "true" to also include the refresh token in the response body
# (for non-browser clients that cannot use cookies). Default: false.
REFRESH_TOKEN_IN_BODY=false
```

---

## Related Documents

- [`doc/auth/jwt.md`](./jwt.md) — access token signing and verification
- [`doc/auth/data-model.md`](./data-model.md) — full schema reference and migration history
- [`doc/auth/repositories.md`](./repositories.md) — repository function signatures

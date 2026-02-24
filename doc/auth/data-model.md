# Auth Data Model

## Tables

### `users`

| Column          | Type        | Notes                        |
|-----------------|-------------|------------------------------|
| `id`            | `uuid`      | PK, `gen_random_uuid()`      |
| `email`         | `text`      | Unique, stored as-is         |
| `password_hash` | `text`      | argon2id hash                |
| `created_at`    | `timestamptz` | Set by DB default            |

### `tenants`

| Column       | Type        | Notes               |
|--------------|-------------|---------------------|
| `id`         | `uuid`      | PK                  |
| `name`       | `text`      |                     |
| `created_at` | `timestamptz` |                   |

### `user_tenant_roles`

| Column      | Type   | Notes                              |
|-------------|--------|------------------------------------|
| `user_id`   | `uuid` | FK → `users.id` ON DELETE CASCADE  |
| `tenant_id` | `uuid` | FK → `tenants.id` ON DELETE CASCADE|
| `role`      | `text` | CHECK IN ('admin','operator','viewer') |
| `created_at`| `timestamptz` |                             |

### `refresh_tokens`

| Column       | Type        | Notes                                        |
|--------------|-------------|----------------------------------------------|
| `id`         | `uuid`      | PK                                           |
| `user_id`    | `uuid`      | FK → `users.id` ON DELETE CASCADE            |
| `tenant_id`  | `uuid`      | FK → `tenants.id` ON DELETE CASCADE          |
| `family_id`  | `uuid`      | Groups tokens in one rotation chain          |
| `token_hash` | `text`      | SHA-256 hex of the opaque bearer value       |
| `expires_at` | `timestamptz` | Must be > `created_at` (CHECK constraint)  |
| `revoked_at` | `timestamptz` | NULL = active; non-NULL = revoked          |
| `created_at` | `timestamptz` |                                            |

#### Indexes

- `refresh_tokens_token_hash_idx` — fast lookup by hash
- `refresh_tokens_user_tenant_active_idx` — partial index `WHERE revoked_at IS NULL`
- `refresh_tokens_family_id_idx` — fast family revocation

---

## `family_id` Design Rationale

Each token rotation chain is grouped by a `family_id` UUID. When a client
receives an access token, it also receives a refresh token. Every call to
`rotateRefreshToken` produces a **new** token in the **same family** while
marking the old one revoked.

### Replay-Attack Detection

If a revoked token is presented again, it means the old token was either
stolen or the client is misbehaving. The correct response is to revoke the
**entire family** immediately — this invalidates any attacker-held tokens
derived from the same rotation chain.

`rotateRefreshToken` implements this:

1. Locks the old token row with `SELECT … FOR UPDATE` (eliminates TOCTOU race).
2. If `revoked_at IS NOT NULL` → calls `revokeByFamily` then throws `UnauthorizedError`.
3. Otherwise revokes the old token and inserts a new one with the same `family_id`.

### Token Family Lifecycle

```
[Initial issue]
  familyId = new UUID
  tokenHash = H(opaqueValue)

[Rotation]
  old token: revoked_at = now()
  new token: family_id = same, new tokenHash

[Logout / revokeAllForUser]
  all tokens for user_id set revoked_at = now()

[Replay detected]
  all tokens in family_id set revoked_at = now()
  UnauthorizedError thrown — user must re-authenticate
```

---

## Migration History

| File                              | Description                         |
|-----------------------------------|-------------------------------------|
| `001_init.sql`                    | Base schema: tenants, users, roles, refresh_tokens |
| `002_refresh_token_family.sql`    | Adds `family_id` column and index to `refresh_tokens` |

# Auth Repositories

All repository functions are pure DB-access helpers. They accept a
`Kysely<Database>` instance (or a `Transaction<Database>` from a parent
transaction) and return plain row types. No business logic lives here.

---

## `src/repositories/users.repo.ts`

### `createUser(db, input): Promise<UsersTable>`

Inserts a new user row and returns it.

| Param                | Type     |
| -------------------- | -------- |
| `input.email`        | `string` |
| `input.passwordHash` | `string` |

**Throws** `ConflictError` if the email is already taken (pg error `23505`).
Email is stored exactly as provided — normalise before calling if needed.

---

### `findUserByEmail(db, email): Promise<UsersTable | undefined>`

Returns the user matching `email`, or `undefined` if none exists.

---

### `findUserById(db, id): Promise<UsersTable | undefined>`

Returns the user matching `id` (UUID string), or `undefined` if none exists.

---

## `src/repositories/refresh-tokens.repo.ts`

### `createRefreshToken(db, input): Promise<RefreshTokensTable>`

Inserts a new refresh token row and returns it.

| Param             | Type                                       |
| ----------------- | ------------------------------------------ |
| `input.userId`    | `string`                                   |
| `input.tenantId`  | `string`                                   |
| `input.familyId`  | `string` — UUID for the rotation family    |
| `input.tokenHash` | `string` — SHA-256 hex of the opaque value |
| `input.expiresAt` | `Date`                                     |

---

### `findValidRefreshTokenByHash(db, tokenHash): Promise<RefreshTokensTable | undefined>`

Returns a token row only when:

- `token_hash = tokenHash`
- `revoked_at IS NULL`
- `expires_at > now()`

Returns `undefined` otherwise.

---

### `revokeByFamily(db, familyId): Promise<void>`

Sets `revoked_at = now()` on all active tokens (`revoked_at IS NULL`) that
share the given `family_id`. Idempotent — safe to call multiple times.

---

### `revokeAllForUser(db, userId): Promise<void>`

Sets `revoked_at = now()` on all active tokens for `userId`, across all
tenants. Use during logout or after a security incident.

---

### `rotateRefreshToken(db, oldTokenHash, newToken): Promise<RefreshTokensTable>`

Atomic rotation inside a database transaction.

| Param                | Type                                         |
| -------------------- | -------------------------------------------- |
| `oldTokenHash`       | `string` — hash of the token being exchanged |
| `newToken.userId`    | `string`                                     |
| `newToken.tenantId`  | `string`                                     |
| `newToken.tokenHash` | `string` — hash of the newly issued token    |
| `newToken.expiresAt` | `Date`                                       |

**Steps:**

1. `SELECT … FOR UPDATE` on `old_token_hash` — acquires a row lock so
   concurrent rotation attempts for the same hash are serialised.
2. Row missing → **throws `UnauthorizedError`** (`"Invalid refresh token"`).
3. Row already revoked → calls `revokeByFamily` on the whole family, then
   **throws `UnauthorizedError`** (`"Refresh token reuse detected"`). The
   caller must force the user to re-authenticate.
4. Sets `revoked_at = now()` on the old token.
5. Inserts a new token inheriting `family_id` from the old token.
6. Returns the new token row.

---

## Composing in External Transactions

Every function accepts `Kysely<Database> | Transaction<Database>`. Pass a
`Transaction` to enlist a repository call in a larger transaction:

```typescript
await db.transaction().execute(async (trx) => {
  const user = await createUser(trx, { email, passwordHash });
  await createRefreshToken(trx, { userId: user.id, ... });
});
```

`rotateRefreshToken` always starts its own nested transaction. When called
inside a parent transaction (`trx`), Kysely uses a `SAVEPOINT` automatically.

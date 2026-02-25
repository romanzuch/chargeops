# Stations Repository

All repository functions are pure DB-access helpers. They accept a
`Kysely<Database>` instance (or a `Transaction<Database>` from a parent
transaction) and return plain row types. No business logic lives here —
that belongs in `StationsService`.

Write functions and tenant-scoped reads enforce isolation at the SQL level by
including `tenant_id` in every query. The two public read functions
(`findPublicStations`, `findPublicStationById`) intentionally omit the tenant
filter — they return matching stations across all tenants, gated only by
`visibility = 'public'`.

---

## `src/repositories/stations.repo.ts`

### `createStation(db, input): Promise<StationsTable>`

Inserts a new station row and returns it.

| Param              | Type            | Notes                                       |
| ------------------ | --------------- | ------------------------------------------- |
| `input.tenantId`   | `string`        | UUID — always set from the auth context     |
| `input.name`       | `string`        | Required                                    |
| `input.externalId` | `string`        | Optional                                    |
| `input.latitude`   | `number`        | Optional                                    |
| `input.longitude`  | `number`        | Optional                                    |
| `input.status`     | `StationStatus`     | Optional; DB defaults to `'active'`         |
| `input.visibility` | `StationVisibility` | Optional; DB defaults to `'public'`         |

Only the fields that are explicitly provided in `input` are included in the
`INSERT` — omitted optional fields fall back to their DB defaults.

---

### `updateStation(db, stationId, tenantId, input): Promise<StationsTable | undefined>`

Updates a station row and returns the updated record, or `undefined` if no
matching row was found.

| Param              | Type                | Notes                                              |
| ------------------ | ------------------- | -------------------------------------------------- |
| `stationId`        | `string`            | UUID of the station to update                      |
| `tenantId`         | `string`            | UUID — enforces tenant isolation in the WHERE clause |
| `input.name`       | `string`            | Optional                                           |
| `input.externalId` | `string \| null`    | Optional; pass `null` to clear the column          |
| `input.latitude`   | `number \| null`    | Optional; pass `null` to clear the column          |
| `input.longitude`  | `number \| null`    | Optional; pass `null` to clear the column          |
| `input.status`     | `StationStatus`     | Optional                                           |
| `input.visibility` | `StationVisibility` | Optional                                           |

The `WHERE` clause is:

```sql
WHERE id = $stationId
  AND tenant_id = $tenantId
  AND deleted_at IS NULL
```

`updated_at` is always set to `now()` on every successful update.

Returns `undefined` when the station does not exist, is soft-deleted, or
belongs to a different tenant — all three cases are intentionally
indistinguishable at this layer.

---

### `findStationById(db, stationId, tenantId): Promise<StationsTable | undefined>`

Returns the station matching `stationId` within `tenantId`, or `undefined`
if no matching live (non-soft-deleted) record exists.

```sql
WHERE id = $stationId
  AND tenant_id = $tenantId
  AND deleted_at IS NULL
```

---

### `findPublicStations(db): Promise<StationsTable[]>`

Returns all non-deleted stations with `visibility = 'public'`. No tenant filter —
this is the data source for the public station discovery endpoints used by EV drivers.

```sql
WHERE visibility = 'public'
  AND deleted_at IS NULL
```

---

### `findPublicStationById(db, stationId): Promise<StationsTable | undefined>`

Returns a single public station by ID, or `undefined` if the station does not exist,
is soft-deleted, or has `visibility = 'private'`. All three cases surface as 404 at
the route level to prevent ID enumeration.

```sql
WHERE id = $stationId
  AND visibility = 'public'
  AND deleted_at IS NULL
```

---

## Composing in External Transactions

Every function accepts `Kysely<Database> | Transaction<Database>`. Pass a
`Transaction` to enlist a repository call in a larger transaction:

```typescript
await db.transaction().execute(async (trx) => {
  const station = await createStation(trx, { tenantId, name, ... });
  // ... other transactional work
});
```

---

## Related Documents

- [`doc/stations/data-model.md`](./data-model.md) — schema reference
- [`doc/stations/api.md`](./api.md) — HTTP endpoint reference
- [`doc/auth/repositories.md`](../auth/repositories.md) — auth repository patterns

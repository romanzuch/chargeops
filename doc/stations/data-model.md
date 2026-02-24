# Stations Data Model

## Tables

### `stations`

| Column        | Type               | Notes                                                    |
| ------------- | ------------------ | -------------------------------------------------------- |
| `id`          | `uuid`             | PK, `gen_random_uuid()`                                  |
| `external_id` | `text`             | Optional — maps to an ID in an external system           |
| `name`        | `text`             | Human-readable station name                              |
| `tenant_id`   | `uuid`             | FK → `tenants.id` ON DELETE CASCADE                      |
| `latitude`    | `double precision` | Optional geographic coordinate                           |
| `longitude`   | `double precision` | Optional geographic coordinate                           |
| `status`      | `text`             | Default `'active'`; CHECK constraint (see below)         |
| `created_at`  | `timestamptz`      | Set by DB default                                        |
| `updated_at`  | `timestamptz`      | Set by DB default; should be updated on every write      |
| `deleted_at`  | `timestamptz`      | NULL = live record; non-NULL = soft-deleted              |

#### Status Values

The `status_type_check` constraint restricts `status` to:

| Value       | Meaning                                          |
| ----------- | ------------------------------------------------ |
| `active`    | Station is live and operational (default)        |
| `planning`  | Station is planned but not yet operational       |
| `inactive`  | Station has been decommissioned or taken offline |
| `error`     | Station is reporting a fault condition           |

---

## Design Notes

### Tenant Scoping

Every station belongs to exactly one tenant via `tenant_id`. Deleting a tenant
cascades and removes all its stations. All queries against `stations` must
include a `tenant_id` filter to enforce data isolation.

### Soft Delete

`deleted_at` is used for soft deletes. A non-NULL value means the record is
logically deleted and should be excluded from normal queries:

```sql
WHERE deleted_at IS NULL
```

Hard deletion is not performed to preserve audit history.

### Geolocation

`latitude` and `longitude` are stored as bare `DOUBLE PRECISION` columns. They
are optional to accommodate stations that have not yet been geo-coded. Future
work may migrate these to a PostGIS `GEOMETRY(Point, 4326)` column for
spatial query support.

---

## Migration History

| File                  | Description                  |
| --------------------- | ---------------------------- |
| `003_stations.sql`    | Creates the `stations` table |

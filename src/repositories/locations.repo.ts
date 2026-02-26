import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";
import type { Database, LocationVisibility, LocationsTable } from "../db/types.js";

export interface CreateLocationInput {
  tenantId: string;
  name: string;
  address?: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  visibility?: LocationVisibility;
}

export interface UpdateLocationInput {
  name?: string;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  visibility?: LocationVisibility;
}

export interface PaginationInput {
  limit: number;
  offset: number;
}

export interface PaginatedLocations {
  rows: Selectable<LocationsTable>[];
  total: number;
}

export async function createLocation(
  db: Kysely<Database>,
  input: CreateLocationInput,
): Promise<Selectable<LocationsTable>> {
  return db
    .insertInto("locations")
    .values({
      tenant_id: input.tenantId,
      name: input.name,
      ...(input.address !== undefined && { address: input.address }),
      ...(input.city !== undefined && { city: input.city }),
      ...(input.country !== undefined && { country: input.country }),
      ...(input.latitude !== undefined && { latitude: input.latitude }),
      ...(input.longitude !== undefined && { longitude: input.longitude }),
      ...(input.visibility !== undefined && { visibility: input.visibility }),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function findLocationById(
  db: Kysely<Database>,
  locationId: string,
  tenantId: string,
): Promise<Selectable<LocationsTable> | undefined> {
  return db
    .selectFrom("locations")
    .selectAll()
    .where("id", "=", locationId)
    .where("tenant_id", "=", tenantId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
}

export async function findPublicLocations(
  db: Kysely<Database>,
  pagination: PaginationInput,
): Promise<PaginatedLocations> {
  const baseQuery = db
    .selectFrom("locations")
    .where("visibility", "=", "public")
    .where("deleted_at", "is", null);

  const [rows, countRow] = await Promise.all([
    baseQuery.selectAll().limit(pagination.limit).offset(pagination.offset).execute(),
    baseQuery.select((eb) => eb.fn.countAll<string>().as("total")).executeTakeFirstOrThrow(),
  ]);

  return { rows, total: Number(countRow.total) };
}

export async function findPublicLocationById(
  db: Kysely<Database>,
  locationId: string,
): Promise<Selectable<LocationsTable> | undefined> {
  return db
    .selectFrom("locations")
    .selectAll()
    .where("id", "=", locationId)
    .where("visibility", "=", "public")
    .where("deleted_at", "is", null)
    .executeTakeFirst();
}

export async function findLocationsByTenant(
  db: Kysely<Database>,
  tenantId: string,
  pagination: PaginationInput,
): Promise<PaginatedLocations> {
  const baseQuery = db
    .selectFrom("locations")
    .where("tenant_id", "=", tenantId)
    .where("deleted_at", "is", null);

  const [rows, countRow] = await Promise.all([
    baseQuery.selectAll().limit(pagination.limit).offset(pagination.offset).execute(),
    baseQuery.select((eb) => eb.fn.countAll<string>().as("total")).executeTakeFirstOrThrow(),
  ]);

  return { rows, total: Number(countRow.total) };
}

export async function updateLocation(
  db: Kysely<Database>,
  locationId: string,
  tenantId: string,
  input: UpdateLocationInput,
): Promise<Selectable<LocationsTable> | undefined> {
  return db
    .updateTable("locations")
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.address !== undefined && { address: input.address }),
      ...(input.city !== undefined && { city: input.city }),
      ...(input.country !== undefined && { country: input.country }),
      ...(input.latitude !== undefined && { latitude: input.latitude }),
      ...(input.longitude !== undefined && { longitude: input.longitude }),
      ...(input.visibility !== undefined && { visibility: input.visibility }),
      updated_at: sql<Date>`now()`,
    })
    .where("id", "=", locationId)
    .where("tenant_id", "=", tenantId)
    .where("deleted_at", "is", null)
    .returningAll()
    .executeTakeFirst();
}

export async function softDeleteLocation(
  db: Kysely<Database>,
  locationId: string,
  tenantId: string,
): Promise<boolean> {
  const result = await db
    .updateTable("locations")
    .set({ deleted_at: sql<Date>`now()` })
    .where("id", "=", locationId)
    .where("tenant_id", "=", tenantId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();

  return (result.numUpdatedRows ?? 0n) > 0n;
}

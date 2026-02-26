import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";
import type { Database, StationStatus, StationVisibility, StationsTable } from "../db/types.js";

export interface CreateStationInput {
  tenantId: string;
  name: string;
  externalId?: string;
  locationId?: string;
  status?: StationStatus;
  visibility?: StationVisibility;
}

export interface UpdateStationInput {
  name?: string;
  externalId?: string | null;
  locationId?: string | null;
  status?: StationStatus;
  visibility?: StationVisibility;
}

export async function createStation(
  db: Kysely<Database>,
  input: CreateStationInput,
): Promise<Selectable<StationsTable>> {
  return db
    .insertInto("stations")
    .values({
      tenant_id: input.tenantId,
      name: input.name,
      ...(input.externalId !== undefined && { external_id: input.externalId }),
      ...(input.locationId !== undefined && { location_id: input.locationId }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.visibility !== undefined && { visibility: input.visibility }),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateStation(
  db: Kysely<Database>,
  stationId: string,
  tenantId: string,
  input: UpdateStationInput,
): Promise<Selectable<StationsTable> | undefined> {
  return db
    .updateTable("stations")
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.externalId !== undefined && { external_id: input.externalId }),
      ...(input.locationId !== undefined && { location_id: input.locationId }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.visibility !== undefined && { visibility: input.visibility }),
      updated_at: sql<Date>`now()`,
    })
    .where("id", "=", stationId)
    .where("tenant_id", "=", tenantId)
    .where("deleted_at", "is", null)
    .returningAll()
    .executeTakeFirst();
}

export async function findStationById(
  db: Kysely<Database>,
  stationId: string,
  tenantId: string,
): Promise<Selectable<StationsTable> | undefined> {
  return db
    .selectFrom("stations")
    .selectAll()
    .where("id", "=", stationId)
    .where("tenant_id", "=", tenantId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
}

export interface PaginationInput {
  limit: number;
  offset: number;
}

export interface PaginatedStations {
  rows: Selectable<StationsTable>[];
  total: number;
}

export async function findStationsByTenant(
  db: Kysely<Database>,
  tenantId: string,
  pagination: PaginationInput,
): Promise<PaginatedStations> {
  const baseQuery = db
    .selectFrom("stations")
    .where("tenant_id", "=", tenantId)
    .where("deleted_at", "is", null);

  const [rows, countRow] = await Promise.all([
    baseQuery.selectAll().limit(pagination.limit).offset(pagination.offset).execute(),
    baseQuery.select((eb) => eb.fn.countAll<string>().as("total")).executeTakeFirstOrThrow(),
  ]);

  return { rows, total: Number(countRow.total) };
}

export async function findStationByIdForTenant(
  db: Kysely<Database>,
  stationId: string,
  tenantId: string,
): Promise<Selectable<StationsTable> | undefined> {
  return db
    .selectFrom("stations")
    .selectAll()
    .where("id", "=", stationId)
    .where("tenant_id", "=", tenantId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
}

export async function findPublicStations(
  db: Kysely<Database>,
  pagination: PaginationInput,
): Promise<PaginatedStations> {
  const baseQuery = db
    .selectFrom("stations")
    .where("visibility", "=", "public")
    .where("deleted_at", "is", null);

  const [rows, countRow] = await Promise.all([
    baseQuery.selectAll().limit(pagination.limit).offset(pagination.offset).execute(),
    baseQuery.select((eb) => eb.fn.countAll<string>().as("total")).executeTakeFirstOrThrow(),
  ]);

  return { rows, total: Number(countRow.total) };
}

export async function findPublicStationById(
  db: Kysely<Database>,
  stationId: string,
): Promise<Selectable<StationsTable> | undefined> {
  return db
    .selectFrom("stations")
    .selectAll()
    .where("id", "=", stationId)
    .where("visibility", "=", "public")
    .where("deleted_at", "is", null)
    .executeTakeFirst();
}

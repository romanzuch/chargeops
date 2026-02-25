import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";
import type { Database, StationStatus, StationVisibility, StationsTable } from "../db/types.js";

export interface CreateStationInput {
  tenantId: string;
  name: string;
  externalId?: string;
  latitude?: number;
  longitude?: number;
  status?: StationStatus;
  visibility?: StationVisibility;
}

export interface UpdateStationInput {
  name?: string;
  externalId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
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
      ...(input.latitude !== undefined && { latitude: input.latitude }),
      ...(input.longitude !== undefined && { longitude: input.longitude }),
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
      ...(input.latitude !== undefined && { latitude: input.latitude }),
      ...(input.longitude !== undefined && { longitude: input.longitude }),
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

export async function findStationsByTenant(
  db: Kysely<Database>,
  tenantId: string,
): Promise<Selectable<StationsTable>[]> {
  return db
    .selectFrom("stations")
    .selectAll()
    .where("tenant_id", "=", tenantId)
    .where("deleted_at", "is", null)
    .execute();
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
): Promise<Selectable<StationsTable>[]> {
  return db
    .selectFrom("stations")
    .selectAll()
    .where("visibility", "=", "public")
    .where("deleted_at", "is", null)
    .execute();
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

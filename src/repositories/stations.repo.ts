import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";
import type { Database, StationStatus, StationsTable } from "../db/types.js";

export interface CreateStationInput {
  tenantId: string;
  name: string;
  externalId?: string;
  latitude?: number;
  longitude?: number;
  status?: StationStatus;
}

export interface UpdateStationInput {
  name?: string;
  externalId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status?: StationStatus;
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

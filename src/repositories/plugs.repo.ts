import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";
import type { ConnectorType, Database, PlugStatus, PlugsTable } from "../db/types.js";

export interface CreatePlugInput {
  stationId: string;
  connectorType: ConnectorType;
  maxPowerKw: number;
  status?: PlugStatus;
}

export interface UpdatePlugInput {
  connectorType?: ConnectorType;
  maxPowerKw?: number;
  status?: PlugStatus;
}

export interface PaginationInput {
  limit: number;
  offset: number;
}

export interface PaginatedPlugs {
  rows: Selectable<PlugsTable>[];
  total: number;
}

export async function createPlug(
  db: Kysely<Database>,
  input: CreatePlugInput,
): Promise<Selectable<PlugsTable>> {
  return db
    .insertInto("plugs")
    .values({
      station_id: input.stationId,
      connector_type: input.connectorType,
      max_power_kw: input.maxPowerKw,
      ...(input.status !== undefined && { status: input.status }),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function findPlugsByStation(
  db: Kysely<Database>,
  stationId: string,
  pagination: PaginationInput,
): Promise<PaginatedPlugs> {
  const baseQuery = db
    .selectFrom("plugs")
    .where("station_id", "=", stationId)
    .where("deleted_at", "is", null);

  const [rows, countRow] = await Promise.all([
    baseQuery.selectAll().limit(pagination.limit).offset(pagination.offset).execute(),
    baseQuery.select((eb) => eb.fn.countAll<string>().as("total")).executeTakeFirstOrThrow(),
  ]);

  return { rows, total: Number(countRow.total) };
}

export async function findPlugById(
  db: Kysely<Database>,
  plugId: string,
): Promise<Selectable<PlugsTable> | undefined> {
  return db
    .selectFrom("plugs")
    .selectAll()
    .where("id", "=", plugId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
}

export async function updatePlug(
  db: Kysely<Database>,
  plugId: string,
  stationId: string,
  input: UpdatePlugInput,
): Promise<Selectable<PlugsTable> | undefined> {
  return db
    .updateTable("plugs")
    .set({
      ...(input.connectorType !== undefined && { connector_type: input.connectorType }),
      ...(input.maxPowerKw !== undefined && { max_power_kw: input.maxPowerKw }),
      ...(input.status !== undefined && { status: input.status }),
      updated_at: sql<Date>`now()`,
    })
    .where("id", "=", plugId)
    .where("station_id", "=", stationId)
    .where("deleted_at", "is", null)
    .returningAll()
    .executeTakeFirst();
}

export async function softDeletePlug(
  db: Kysely<Database>,
  plugId: string,
  stationId: string,
): Promise<boolean> {
  const result = await db
    .updateTable("plugs")
    .set({ deleted_at: sql<Date>`now()` })
    .where("id", "=", plugId)
    .where("station_id", "=", stationId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();

  return (result.numUpdatedRows ?? 0n) > 0n;
}

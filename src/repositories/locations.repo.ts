import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";
import type {
  Database,
  LocationVisibility,
  LocationsTable,
  PlugsTable,
  StationsTable,
} from "../db/types.js";

export interface StationWithPlugs {
  station: Selectable<StationsTable>;
  plugs: Selectable<PlugsTable>[];
}

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

type ConnectorType = "ccs" | "chademo" | "type2" | "type1" | "schuko" | "other";

const HIGH_POWER_KW = 150;

export interface LocationWithSummary {
  location: Selectable<LocationsTable>;
  stationCount: number;
  activeStationCount: number;
  plugSummary: {
    total: number;
    available: number;
    maxPowerKw: number | null;
    hasHighPowerCharging: boolean;
    connectorTypes: ConnectorType[];
  };
}

export interface PaginatedLocationsWithSummary {
  rows: LocationWithSummary[];
  total: number;
}

function rowToLocationWithSummary(row: {
  id: string;
  tenant_id: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  visibility: LocationVisibility;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  station_count: string;
  active_station_count: string;
  total_plugs: string;
  available_plugs: string;
  max_power_kw: string | null;
  connector_types: string[] | null;
}): LocationWithSummary {
  const maxPowerKw = row.max_power_kw !== null ? Number(row.max_power_kw) : null;
  return {
    location: {
      id: row.id,
      tenant_id: row.tenant_id,
      name: row.name,
      address: row.address,
      city: row.city,
      country: row.country,
      latitude: row.latitude,
      longitude: row.longitude,
      visibility: row.visibility,
      created_at: row.created_at,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at,
    } as Selectable<LocationsTable>,
    stationCount: Number(row.station_count),
    activeStationCount: Number(row.active_station_count),
    plugSummary: {
      total: Number(row.total_plugs),
      available: Number(row.available_plugs),
      maxPowerKw,
      hasHighPowerCharging: maxPowerKw !== null && maxPowerKw >= HIGH_POWER_KW,
      connectorTypes: (row.connector_types ?? []) as ConnectorType[],
    },
  };
}

const summarySelectCols = [
  sql<string>`count(distinct s.id)`.as("station_count"),
  sql<string>`count(distinct s.id) filter (where s.status = 'active')`.as("active_station_count"),
  sql<string>`count(p.id)`.as("total_plugs"),
  sql<string>`count(p.id) filter (where p.status = 'available')`.as("available_plugs"),
  sql<string | null>`max(p.max_power_kw)`.as("max_power_kw"),
  sql<
    string[] | null
  >`array_agg(distinct p.connector_type::text) filter (where p.id is not null)`.as(
    "connector_types",
  ),
] as const;

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

/**
 * Returns locations accessible to a specific user within a tenant.
 * Visibility rules:
 *   - Always includes public locations
 *   - Also includes private locations in tariff zones the user's customer groups have access to
 */
export async function findAccessibleLocations(
  db: Kysely<Database>,
  tenantId: string,
  userId: string,
  pagination: PaginationInput,
): Promise<PaginatedLocations> {
  const baseQuery = db
    .selectFrom("locations as l")
    .where("l.tenant_id", "=", tenantId)
    .where("l.deleted_at", "is", null)
    .where((eb) =>
      eb.or([
        eb("l.visibility", "=", "public"),
        eb.exists(
          eb
            .selectFrom("tariff_zone_locations as tzl")
            .innerJoin(
              "customer_group_tariff_zones as cgtz",
              "cgtz.tariff_zone_id",
              "tzl.tariff_zone_id",
            )
            .innerJoin(
              "user_customer_groups as ucg",
              "ucg.customer_group_id",
              "cgtz.customer_group_id",
            )
            .select(sql<number>`1`.as("one"))
            .whereRef("tzl.location_id", "=", "l.id")
            .where("ucg.user_id", "=", userId),
        ),
      ]),
    );

  const [rows, countRow] = await Promise.all([
    baseQuery.selectAll("l").distinct().limit(pagination.limit).offset(pagination.offset).execute(),
    baseQuery.select((eb) => eb.fn.countAll<string>().as("total")).executeTakeFirstOrThrow(),
  ]);

  return { rows, total: Number(countRow.total) };
}

export async function findTenantLocationsWithSummary(
  db: Kysely<Database>,
  tenantId: string,
  pagination: PaginationInput,
): Promise<PaginatedLocationsWithSummary> {
  const [countRow, dataRows] = await Promise.all([
    db
      .selectFrom("locations")
      .where("tenant_id", "=", tenantId)
      .where("deleted_at", "is", null)
      .select((eb) => eb.fn.countAll<string>().as("total"))
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("locations as l")
      .leftJoin("stations as s", (join) =>
        join.onRef("s.location_id", "=", "l.id").on("s.deleted_at", "is", null),
      )
      .leftJoin("plugs as p", (join) =>
        join.onRef("p.station_id", "=", "s.id").on("p.deleted_at", "is", null),
      )
      .where("l.tenant_id", "=", tenantId)
      .where("l.deleted_at", "is", null)
      .groupBy("l.id")
      .select([
        "l.id",
        "l.tenant_id",
        "l.name",
        "l.address",
        "l.city",
        "l.country",
        "l.latitude",
        "l.longitude",
        "l.visibility",
        "l.created_at",
        "l.updated_at",
        "l.deleted_at",
        ...summarySelectCols,
      ])
      .orderBy("l.created_at", "desc")
      .limit(pagination.limit)
      .offset(pagination.offset)
      .execute(),
  ]);

  return { rows: dataRows.map(rowToLocationWithSummary), total: Number(countRow.total) };
}

export async function findPublicLocationsWithSummary(
  db: Kysely<Database>,
  pagination: PaginationInput,
): Promise<PaginatedLocationsWithSummary> {
  const [countRow, dataRows] = await Promise.all([
    db
      .selectFrom("locations")
      .where("visibility", "=", "public")
      .where("deleted_at", "is", null)
      .select((eb) => eb.fn.countAll<string>().as("total"))
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("locations as l")
      .leftJoin("stations as s", (join) =>
        join
          .onRef("s.location_id", "=", "l.id")
          .on("s.deleted_at", "is", null)
          .on("s.visibility", "=", "public"),
      )
      .leftJoin("plugs as p", (join) =>
        join.onRef("p.station_id", "=", "s.id").on("p.deleted_at", "is", null),
      )
      .where("l.visibility", "=", "public")
      .where("l.deleted_at", "is", null)
      .groupBy("l.id")
      .select([
        "l.id",
        "l.tenant_id",
        "l.name",
        "l.address",
        "l.city",
        "l.country",
        "l.latitude",
        "l.longitude",
        "l.visibility",
        "l.created_at",
        "l.updated_at",
        "l.deleted_at",
        ...summarySelectCols,
      ])
      .orderBy("l.created_at", "desc")
      .limit(pagination.limit)
      .offset(pagination.offset)
      .execute(),
  ]);

  return { rows: dataRows.map(rowToLocationWithSummary), total: Number(countRow.total) };
}

export async function findAccessibleLocationsWithSummary(
  db: Kysely<Database>,
  tenantId: string,
  userId: string,
  pagination: PaginationInput,
): Promise<PaginatedLocationsWithSummary> {
  const [countRow, dataRows] = await Promise.all([
    db
      .selectFrom("locations as l")
      .where("l.tenant_id", "=", tenantId)
      .where("l.deleted_at", "is", null)
      .where((eb) =>
        eb.or([
          eb("l.visibility", "=", "public"),
          eb.exists(
            eb
              .selectFrom("tariff_zone_locations as tzl")
              .innerJoin(
                "customer_group_tariff_zones as cgtz",
                "cgtz.tariff_zone_id",
                "tzl.tariff_zone_id",
              )
              .innerJoin(
                "user_customer_groups as ucg",
                "ucg.customer_group_id",
                "cgtz.customer_group_id",
              )
              .select(sql<number>`1`.as("one"))
              .whereRef("tzl.location_id", "=", "l.id")
              .where("ucg.user_id", "=", userId),
          ),
        ]),
      )
      .select((eb) => eb.fn.countAll<string>().as("total"))
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("locations as l")
      .leftJoin("stations as s", (join) =>
        join.onRef("s.location_id", "=", "l.id").on("s.deleted_at", "is", null),
      )
      .leftJoin("plugs as p", (join) =>
        join.onRef("p.station_id", "=", "s.id").on("p.deleted_at", "is", null),
      )
      .where("l.tenant_id", "=", tenantId)
      .where("l.deleted_at", "is", null)
      .where((eb) =>
        eb.or([
          eb("l.visibility", "=", "public"),
          eb.exists(
            eb
              .selectFrom("tariff_zone_locations as tzl")
              .innerJoin(
                "customer_group_tariff_zones as cgtz",
                "cgtz.tariff_zone_id",
                "tzl.tariff_zone_id",
              )
              .innerJoin(
                "user_customer_groups as ucg",
                "ucg.customer_group_id",
                "cgtz.customer_group_id",
              )
              .select(sql<number>`1`.as("one"))
              .whereRef("tzl.location_id", "=", "l.id")
              .where("ucg.user_id", "=", userId),
          ),
        ]),
      )
      .groupBy("l.id")
      .select([
        "l.id",
        "l.tenant_id",
        "l.name",
        "l.address",
        "l.city",
        "l.country",
        "l.latitude",
        "l.longitude",
        "l.visibility",
        "l.created_at",
        "l.updated_at",
        "l.deleted_at",
        ...summarySelectCols,
      ])
      .orderBy("l.created_at", "desc")
      .limit(pagination.limit)
      .offset(pagination.offset)
      .execute(),
  ]);

  return { rows: dataRows.map(rowToLocationWithSummary), total: Number(countRow.total) };
}

async function fetchPlugsForStations(
  db: Kysely<Database>,
  stationIds: string[],
): Promise<Map<string, Selectable<PlugsTable>[]>> {
  const plugs = await db
    .selectFrom("plugs")
    .selectAll()
    .where("station_id", "in", stationIds)
    .where("deleted_at", "is", null)
    .execute();

  const byStation = new Map<string, Selectable<PlugsTable>[]>();
  for (const plug of plugs) {
    const list = byStation.get(plug.station_id) ?? [];
    list.push(plug);
    byStation.set(plug.station_id, list);
  }
  return byStation;
}

export async function findPublicStationsWithPlugsForLocation(
  db: Kysely<Database>,
  locationId: string,
): Promise<StationWithPlugs[]> {
  const stations = await db
    .selectFrom("stations")
    .selectAll()
    .where("location_id", "=", locationId)
    .where("visibility", "=", "public")
    .where("deleted_at", "is", null)
    .execute();

  if (stations.length === 0) return [];

  const plugsByStation = await fetchPlugsForStations(
    db,
    stations.map((s) => s.id),
  );
  return stations.map((station) => ({ station, plugs: plugsByStation.get(station.id) ?? [] }));
}

export async function findAllStationsWithPlugsForLocation(
  db: Kysely<Database>,
  locationId: string,
): Promise<StationWithPlugs[]> {
  const stations = await db
    .selectFrom("stations")
    .selectAll()
    .where("location_id", "=", locationId)
    .where("deleted_at", "is", null)
    .execute();

  if (stations.length === 0) return [];

  const plugsByStation = await fetchPlugsForStations(
    db,
    stations.map((s) => s.id),
  );
  return stations.map((station) => ({ station, plugs: plugsByStation.get(station.id) ?? [] }));
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

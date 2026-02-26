import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";
import type { Database, TariffZonesTable } from "../db/types.js";

export interface PaginationInput {
  limit: number;
  offset: number;
}

export interface PaginatedTariffZones {
  rows: Selectable<TariffZonesTable>[];
  total: number;
}

export async function createTariffZone(
  db: Kysely<Database>,
  tenantId: string,
  name: string,
): Promise<Selectable<TariffZonesTable>> {
  return db
    .insertInto("tariff_zones")
    .values({ tenant_id: tenantId, name })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function findTariffZoneById(
  db: Kysely<Database>,
  zoneId: string,
  tenantId: string,
): Promise<Selectable<TariffZonesTable> | undefined> {
  return db
    .selectFrom("tariff_zones")
    .selectAll()
    .where("id", "=", zoneId)
    .where("tenant_id", "=", tenantId)
    .executeTakeFirst();
}

export async function findTariffZonesByTenant(
  db: Kysely<Database>,
  tenantId: string,
  pagination: PaginationInput,
): Promise<PaginatedTariffZones> {
  const baseQuery = db.selectFrom("tariff_zones").where("tenant_id", "=", tenantId);

  const [rows, countRow] = await Promise.all([
    baseQuery.selectAll().limit(pagination.limit).offset(pagination.offset).execute(),
    baseQuery.select((eb) => eb.fn.countAll<string>().as("total")).executeTakeFirstOrThrow(),
  ]);

  return { rows, total: Number(countRow.total) };
}

export async function updateTariffZone(
  db: Kysely<Database>,
  zoneId: string,
  tenantId: string,
  name: string,
): Promise<Selectable<TariffZonesTable> | undefined> {
  return db
    .updateTable("tariff_zones")
    .set({ name, updated_at: sql<Date>`now()` })
    .where("id", "=", zoneId)
    .where("tenant_id", "=", tenantId)
    .returningAll()
    .executeTakeFirst();
}

export async function addLocationToTariffZone(
  db: Kysely<Database>,
  zoneId: string,
  locationId: string,
): Promise<void> {
  await db
    .insertInto("tariff_zone_locations")
    .values({ tariff_zone_id: zoneId, location_id: locationId })
    .onConflict((oc) => oc.doNothing())
    .execute();
}

export async function removeLocationFromTariffZone(
  db: Kysely<Database>,
  zoneId: string,
  locationId: string,
): Promise<boolean> {
  const result = await db
    .deleteFrom("tariff_zone_locations")
    .where("tariff_zone_id", "=", zoneId)
    .where("location_id", "=", locationId)
    .executeTakeFirst();

  return (result.numDeletedRows ?? 0n) > 0n;
}

export async function addTariffToTariffZone(
  db: Kysely<Database>,
  zoneId: string,
  tariffId: string,
): Promise<void> {
  await db
    .insertInto("tariff_zone_tariffs")
    .values({ tariff_zone_id: zoneId, tariff_id: tariffId })
    .onConflict((oc) => oc.doNothing())
    .execute();
}

export async function removeTariffFromTariffZone(
  db: Kysely<Database>,
  zoneId: string,
  tariffId: string,
): Promise<boolean> {
  const result = await db
    .deleteFrom("tariff_zone_tariffs")
    .where("tariff_zone_id", "=", zoneId)
    .where("tariff_id", "=", tariffId)
    .executeTakeFirst();

  return (result.numDeletedRows ?? 0n) > 0n;
}

/**
 * Resolves the applicable tariff for a user at a given location.
 *
 * Priority order:
 * 1. Tariff directly assigned to one of the user's customer groups (most specific)
 * 2. Tariff from a tariff zone that contains the location, accessible to the user's groups
 * 3. null (free session)
 */
export async function resolveApplicableTariff(
  db: Kysely<Database>,
  userId: string,
  tenantId: string,
  locationId: string,
): Promise<string | null> {
  // Priority 1: direct customer group tariff
  const directTariff = await db
    .selectFrom("customer_group_tariffs as cgt")
    .innerJoin("user_customer_groups as ucg", "ucg.customer_group_id", "cgt.customer_group_id")
    .innerJoin("customer_groups as cg", "cg.id", "cgt.customer_group_id")
    .select("cgt.tariff_id")
    .where("ucg.user_id", "=", userId)
    .where("cg.tenant_id", "=", tenantId)
    .limit(1)
    .executeTakeFirst();

  if (directTariff) {
    return directTariff.tariff_id;
  }

  // Priority 2: tariff zone tariff for accessible zones containing this location
  const zoneTariff = await db
    .selectFrom("tariff_zone_tariffs as tzt")
    .innerJoin("tariff_zone_locations as tzl", "tzl.tariff_zone_id", "tzt.tariff_zone_id")
    .innerJoin("customer_group_tariff_zones as cgtz", "cgtz.tariff_zone_id", "tzt.tariff_zone_id")
    .innerJoin("user_customer_groups as ucg", "ucg.customer_group_id", "cgtz.customer_group_id")
    .innerJoin("tariff_zones as tz", "tz.id", "tzt.tariff_zone_id")
    .select("tzt.tariff_id")
    .where("tzl.location_id", "=", locationId)
    .where("ucg.user_id", "=", userId)
    .where("tz.tenant_id", "=", tenantId)
    .limit(1)
    .executeTakeFirst();

  return zoneTariff?.tariff_id ?? null;
}

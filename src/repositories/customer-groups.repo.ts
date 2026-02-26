import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";
import type { CustomerGroupsTable, Database } from "../db/types.js";

export interface PaginationInput {
  limit: number;
  offset: number;
}

export interface PaginatedCustomerGroups {
  rows: Selectable<CustomerGroupsTable>[];
  total: number;
}

export async function createCustomerGroup(
  db: Kysely<Database>,
  tenantId: string,
  name: string,
): Promise<Selectable<CustomerGroupsTable>> {
  return db
    .insertInto("customer_groups")
    .values({ tenant_id: tenantId, name })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function findCustomerGroupById(
  db: Kysely<Database>,
  groupId: string,
  tenantId: string,
): Promise<Selectable<CustomerGroupsTable> | undefined> {
  return db
    .selectFrom("customer_groups")
    .selectAll()
    .where("id", "=", groupId)
    .where("tenant_id", "=", tenantId)
    .executeTakeFirst();
}

export async function findCustomerGroupsByTenant(
  db: Kysely<Database>,
  tenantId: string,
  pagination: PaginationInput,
): Promise<PaginatedCustomerGroups> {
  const baseQuery = db.selectFrom("customer_groups").where("tenant_id", "=", tenantId);

  const [rows, countRow] = await Promise.all([
    baseQuery.selectAll().limit(pagination.limit).offset(pagination.offset).execute(),
    baseQuery.select((eb) => eb.fn.countAll<string>().as("total")).executeTakeFirstOrThrow(),
  ]);

  return { rows, total: Number(countRow.total) };
}

export async function updateCustomerGroup(
  db: Kysely<Database>,
  groupId: string,
  tenantId: string,
  name: string,
): Promise<Selectable<CustomerGroupsTable> | undefined> {
  return db
    .updateTable("customer_groups")
    .set({ name, updated_at: sql<Date>`now()` })
    .where("id", "=", groupId)
    .where("tenant_id", "=", tenantId)
    .returningAll()
    .executeTakeFirst();
}

export async function addUserToCustomerGroup(
  db: Kysely<Database>,
  groupId: string,
  userId: string,
): Promise<void> {
  await db
    .insertInto("user_customer_groups")
    .values({ customer_group_id: groupId, user_id: userId })
    .onConflict((oc) => oc.doNothing())
    .execute();
}

export async function removeUserFromCustomerGroup(
  db: Kysely<Database>,
  groupId: string,
  userId: string,
): Promise<boolean> {
  const result = await db
    .deleteFrom("user_customer_groups")
    .where("customer_group_id", "=", groupId)
    .where("user_id", "=", userId)
    .executeTakeFirst();

  return (result.numDeletedRows ?? 0n) > 0n;
}

export async function assignTariffToCustomerGroup(
  db: Kysely<Database>,
  groupId: string,
  tariffId: string,
): Promise<void> {
  await db
    .insertInto("customer_group_tariffs")
    .values({ customer_group_id: groupId, tariff_id: tariffId })
    .onConflict((oc) => oc.doNothing())
    .execute();
}

export async function removeTariffFromCustomerGroup(
  db: Kysely<Database>,
  groupId: string,
  tariffId: string,
): Promise<boolean> {
  const result = await db
    .deleteFrom("customer_group_tariffs")
    .where("customer_group_id", "=", groupId)
    .where("tariff_id", "=", tariffId)
    .executeTakeFirst();

  return (result.numDeletedRows ?? 0n) > 0n;
}

export async function assignTariffZoneToCustomerGroup(
  db: Kysely<Database>,
  groupId: string,
  tariffZoneId: string,
): Promise<void> {
  await db
    .insertInto("customer_group_tariff_zones")
    .values({ customer_group_id: groupId, tariff_zone_id: tariffZoneId })
    .onConflict((oc) => oc.doNothing())
    .execute();
}

export async function removeTariffZoneFromCustomerGroup(
  db: Kysely<Database>,
  groupId: string,
  tariffZoneId: string,
): Promise<boolean> {
  const result = await db
    .deleteFrom("customer_group_tariff_zones")
    .where("customer_group_id", "=", groupId)
    .where("tariff_zone_id", "=", tariffZoneId)
    .executeTakeFirst();

  return (result.numDeletedRows ?? 0n) > 0n;
}

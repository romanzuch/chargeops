import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";
import type { Database, TariffsTable } from "../db/types.js";

export interface CreateTariffInput {
  tenantId: string;
  name: string;
  pricePerKwh?: number;
  pricePerMinute?: number;
  pricePerSession?: number;
  currency?: string;
}

export interface UpdateTariffInput {
  name?: string;
  pricePerKwh?: number | null;
  pricePerMinute?: number | null;
  pricePerSession?: number | null;
  currency?: string;
}

export interface PaginationInput {
  limit: number;
  offset: number;
}

export interface PaginatedTariffs {
  rows: Selectable<TariffsTable>[];
  total: number;
}

export async function createTariff(
  db: Kysely<Database>,
  input: CreateTariffInput,
): Promise<Selectable<TariffsTable>> {
  return db
    .insertInto("tariffs")
    .values({
      tenant_id: input.tenantId,
      name: input.name,
      ...(input.pricePerKwh !== undefined && { price_per_kwh: input.pricePerKwh }),
      ...(input.pricePerMinute !== undefined && { price_per_minute: input.pricePerMinute }),
      ...(input.pricePerSession !== undefined && { price_per_session: input.pricePerSession }),
      ...(input.currency !== undefined && { currency: input.currency }),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function findTariffById(
  db: Kysely<Database>,
  tariffId: string,
  tenantId: string,
): Promise<Selectable<TariffsTable> | undefined> {
  return db
    .selectFrom("tariffs")
    .selectAll()
    .where("id", "=", tariffId)
    .where("tenant_id", "=", tenantId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
}

export async function findTariffsByTenant(
  db: Kysely<Database>,
  tenantId: string,
  pagination: PaginationInput,
): Promise<PaginatedTariffs> {
  const baseQuery = db
    .selectFrom("tariffs")
    .where("tenant_id", "=", tenantId)
    .where("deleted_at", "is", null);

  const [rows, countRow] = await Promise.all([
    baseQuery.selectAll().limit(pagination.limit).offset(pagination.offset).execute(),
    baseQuery.select((eb) => eb.fn.countAll<string>().as("total")).executeTakeFirstOrThrow(),
  ]);

  return { rows, total: Number(countRow.total) };
}

export async function updateTariff(
  db: Kysely<Database>,
  tariffId: string,
  tenantId: string,
  input: UpdateTariffInput,
): Promise<Selectable<TariffsTable> | undefined> {
  return db
    .updateTable("tariffs")
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.pricePerKwh !== undefined && { price_per_kwh: input.pricePerKwh }),
      ...(input.pricePerMinute !== undefined && { price_per_minute: input.pricePerMinute }),
      ...(input.pricePerSession !== undefined && { price_per_session: input.pricePerSession }),
      ...(input.currency !== undefined && { currency: input.currency }),
      updated_at: sql<Date>`now()`,
    })
    .where("id", "=", tariffId)
    .where("tenant_id", "=", tenantId)
    .where("deleted_at", "is", null)
    .returningAll()
    .executeTakeFirst();
}

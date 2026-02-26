import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";
import type { ChargingSessionsTable, Database } from "../db/types.js";

export interface CreateSessionInput {
  userId: string;
  plugId: string;
  tenantId: string;
  tariffId?: string | null;
}

export interface PaginationInput {
  limit: number;
  offset: number;
}

export interface PaginatedSessions {
  rows: Selectable<ChargingSessionsTable>[];
  total: number;
}

export async function createSession(
  db: Kysely<Database>,
  input: CreateSessionInput,
): Promise<Selectable<ChargingSessionsTable>> {
  return db
    .insertInto("charging_sessions")
    .values({
      user_id: input.userId,
      plug_id: input.plugId,
      tenant_id: input.tenantId,
      tariff_id: input.tariffId ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function findSessionById(
  db: Kysely<Database>,
  sessionId: string,
): Promise<Selectable<ChargingSessionsTable> | undefined> {
  return db
    .selectFrom("charging_sessions")
    .selectAll()
    .where("id", "=", sessionId)
    .executeTakeFirst();
}

export async function findActiveSessionByPlug(
  db: Kysely<Database>,
  plugId: string,
): Promise<Selectable<ChargingSessionsTable> | undefined> {
  return db
    .selectFrom("charging_sessions")
    .selectAll()
    .where("plug_id", "=", plugId)
    .where("status", "=", "active")
    .executeTakeFirst();
}

export async function findSessionsByUser(
  db: Kysely<Database>,
  userId: string,
  tenantId: string,
  pagination: PaginationInput,
): Promise<PaginatedSessions> {
  const baseQuery = db
    .selectFrom("charging_sessions")
    .where("user_id", "=", userId)
    .where("tenant_id", "=", tenantId);

  const [rows, countRow] = await Promise.all([
    baseQuery
      .selectAll()
      .orderBy("started_at", "desc")
      .limit(pagination.limit)
      .offset(pagination.offset)
      .execute(),
    baseQuery.select((eb) => eb.fn.countAll<string>().as("total")).executeTakeFirstOrThrow(),
  ]);

  return { rows, total: Number(countRow.total) };
}

export async function findSessionsByTenant(
  db: Kysely<Database>,
  tenantId: string,
  pagination: PaginationInput,
): Promise<PaginatedSessions> {
  const baseQuery = db.selectFrom("charging_sessions").where("tenant_id", "=", tenantId);

  const [rows, countRow] = await Promise.all([
    baseQuery
      .selectAll()
      .orderBy("started_at", "desc")
      .limit(pagination.limit)
      .offset(pagination.offset)
      .execute(),
    baseQuery.select((eb) => eb.fn.countAll<string>().as("total")).executeTakeFirstOrThrow(),
  ]);

  return { rows, total: Number(countRow.total) };
}

export async function endSession(
  db: Kysely<Database>,
  sessionId: string,
): Promise<Selectable<ChargingSessionsTable> | undefined> {
  return db
    .updateTable("charging_sessions")
    .set({
      ended_at: sql<Date>`now()`,
      status: "completed",
      updated_at: sql<Date>`now()`,
    })
    .where("id", "=", sessionId)
    .where("status", "=", "active")
    .returningAll()
    .executeTakeFirst();
}

import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { Database } from "./types.js";
import { config } from "../config/config.js";

let dbSingleton: Kysely<Database> | null = null;

/**
 * Creates a new Kysely instance backed by a pg Pool.
 *
 * Keep this factory pure so you can unit-test it easily and so we can use it
 * in alternative runtimes later (e.g. serverless).
 */
export function createDb(databaseUrl: string): Kysely<Database> {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });

  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  });
}

export function getDb(): Kysely<Database> {
  if (dbSingleton) return dbSingleton;

  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required to use the database");
  }

  dbSingleton = createDb(config.databaseUrl);

  return dbSingleton;
}

export async function destroyDb(): Promise<void> {
  if (!dbSingleton) return;
  await dbSingleton.destroy();
  dbSingleton = null;
}

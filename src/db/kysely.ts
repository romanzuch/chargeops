import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { Database } from "./types.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

let dbSingleton: Kysely<Database> | null = null;

export function getDb(): Kysely<Database> {
  if (dbSingleton) return dbSingleton;

  const databaseUrl = requireEnv("DATABASE_URL");

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });

  dbSingleton = new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  });

  return dbSingleton;
}

export async function destroyDb(): Promise<void> {
  if (!dbSingleton) return;
  await dbSingleton.destroy();
  dbSingleton = null;
}

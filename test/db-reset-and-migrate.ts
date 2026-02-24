import "dotenv/config";
import { Client } from "pg";
import fs from "node:fs";
import path from "node:path";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function main() {
  const url = requireEnv("DATABASE_URL");

  const client = new Client({ connectionString: url });
  await client.connect();

  // Reset DB: drop all tables in public schema (keep schema itself)
  await client.query(`
    DO $$
    DECLARE
      r RECORD;
    BEGIN
      -- drop all tables
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public')
      LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;

      -- drop all sequences
      FOR r IN (SELECT sequencename FROM pg_sequences WHERE schemaname = 'public')
      LOOP
        EXECUTE 'DROP SEQUENCE IF EXISTS public.' || quote_ident(r.sequencename) || ' CASCADE';
      END LOOP;

      -- drop all views
      FOR r IN (SELECT table_name FROM information_schema.views WHERE table_schema = 'public')
      LOOP
        EXECUTE 'DROP VIEW IF EXISTS public.' || quote_ident(r.table_name) || ' CASCADE';
      END LOOP;
    END $$;
    `);

  // run migrations in order (001_..., 002_..., ...)
  const migrationsDir = path.resolve(process.cwd(), "migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    await client.query(sql);
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

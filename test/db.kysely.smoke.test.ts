import { describe, it, expect, afterAll } from "vitest";
import "dotenv/config";
import { getDb, destroyDb } from "../src/db/kysely.js";

describe("db / kysely", () => {
  afterAll(async () => {
    await destroyDb();
  });
  it("can connect and run a simple query", async () => {
    const db = getDb();
    const row = await db
      .selectNoFrom((eb) => eb.cast(eb.val("1"), "integer").as("ok"))
      .executeTakeFirstOrThrow();
    expect(row.ok).toBe(1);
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "dotenv/config";
import { createDb, destroyDb } from "../../../src/db/kysely.js";
import { createUser, findUserByEmail, findUserById } from "../../../src/repositories/users.repo.js";
import { ConflictError } from "../../../src/http/errors.js";
import type { Kysely } from "kysely";
import type { Database } from "../../../src/db/types.js";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

let db: Kysely<Database>;
const createdUserIds: string[] = [];

async function createTrackedUser(args: { email: string; passwordHash: string }) {
  const user = await createUser(db, args);
  createdUserIds.push(user.id);
  return user;
}

beforeAll(() => {
  db = createDb(requireEnv("DATABASE_URL"));
});

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await db.deleteFrom("users").where("id", "in", createdUserIds).execute();
  }
  await destroyDb();
});

describe("createUser", () => {
  it("happy path: returns a full row", async () => {
    const row = await createTrackedUser({
      email: `create-happy-${Date.now()}@example.com`,
      passwordHash: "hash_value",
    });

    expect(row.id).toBeTruthy();
    expect(row.email).toMatch(/@example\.com$/);
    expect(row.password_hash).toBe("hash_value");
    expect(row.created_at).toBeInstanceOf(Date);
  });

  it("duplicate email → ConflictError", async () => {
    const email = `dup-${Date.now()}@example.com`;
    await createTrackedUser({ email, passwordHash: "hash1" });

    await expect(createUser(db, { email, passwordHash: "hash2" })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("stores email as-is (no normalisation inside repo)", async () => {
    const email = `CaseSensitive-${Date.now()}@Example.COM`;
    const row = await createTrackedUser({ email, passwordHash: "h" });
    expect(row.email).toBe(email);
  });
});

describe("findUserByEmail", () => {
  it("returns the user when found", async () => {
    const email = `find-email-${Date.now()}@example.com`;
    const created = await createTrackedUser({ email, passwordHash: "h" });

    const found = await findUserByEmail(db, email);
    expect(found).toBeDefined();
    expect(found!.id).toBe(created.id);
  });

  it("returns undefined when not found", async () => {
    const result = await findUserByEmail(db, "nobody@example.com");
    expect(result).toBeUndefined();
  });
});

describe("findUserById", () => {
  it("returns the user when found", async () => {
    const created = await createTrackedUser({
      email: `find-id-${Date.now()}@example.com`,
      passwordHash: "h",
    });

    const found = await findUserById(db, created.id);
    expect(found).toBeDefined();
    expect(found!.email).toBe(created.email);
  });

  it("returns undefined when not found", async () => {
    const result = await findUserById(db, "00000000-0000-0000-0000-000000000000");
    expect(result).toBeUndefined();
  });
});

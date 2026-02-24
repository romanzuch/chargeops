import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { createDb, destroyDb } from "../../../src/db/kysely.js";
import { createUser } from "../../../src/repositories/users.repo.js";
import {
  createRefreshToken,
  findValidRefreshTokenByHash,
  revokeByFamily,
  revokeAllForUser,
  rotateRefreshToken,
} from "../../../src/repositories/refresh-tokens.repo.js";
import { UnauthorizedError } from "../../../src/http/errors.js";
import type { Kysely } from "kysely";
import type { Database } from "../../../src/db/types.js";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

let db: Kysely<Database>;

/** Seed a tenant and user, returning their IDs. */
async function seedUserAndTenant(
  label: string,
): Promise<{ userId: string; tenantId: string }> {
  const tenant = await db
    .insertInto("tenants")
    .values({ name: `Tenant-${label}-${Date.now()}` })
    .returning("id")
    .executeTakeFirstOrThrow();

  const user = await createUser(db, {
    email: `${label}-${Date.now()}@example.com`,
    passwordHash: "h",
  });

  return { userId: user.id, tenantId: tenant.id };
}

function futureDate(offsetMs = 60_000): Date {
  return new Date(Date.now() + offsetMs);
}

beforeAll(() => {
  db = createDb(requireEnv("DATABASE_URL"));
});

afterAll(async () => {
  await destroyDb();
});

describe("createRefreshToken", () => {
  it("happy path: row returned with revoked_at = null", async () => {
    const { userId, tenantId } = await seedUserAndTenant("create");
    const row = await createRefreshToken(db, {
      userId,
      tenantId,
      familyId: randomUUID(),
      tokenHash: `hash-${randomUUID()}`,
      expiresAt: futureDate(),
    });

    expect(row.id).toBeTruthy();
    expect(row.user_id).toBe(userId);
    expect(row.tenant_id).toBe(tenantId);
    expect(row.revoked_at).toBeNull();
    expect(row.created_at).toBeInstanceOf(Date);
  });
});

describe("findValidRefreshTokenByHash", () => {
  it("returns the token when valid", async () => {
    const { userId, tenantId } = await seedUserAndTenant("find-valid");
    const hash = `hash-${randomUUID()}`;
    const created = await createRefreshToken(db, {
      userId,
      tenantId,
      familyId: randomUUID(),
      tokenHash: hash,
      expiresAt: futureDate(),
    });

    const found = await findValidRefreshTokenByHash(db, hash);
    expect(found).toBeDefined();
    expect(found!.id).toBe(created.id);
  });

  it("returns undefined when token is revoked", async () => {
    const { userId, tenantId } = await seedUserAndTenant("find-revoked");
    const hash = `hash-${randomUUID()}`;
    const token = await createRefreshToken(db, {
      userId,
      tenantId,
      familyId: randomUUID(),
      tokenHash: hash,
      expiresAt: futureDate(),
    });

    await db
      .updateTable("refresh_tokens")
      .set({ revoked_at: sql`now()` })
      .where("id", "=", token.id)
      .execute();

    const found = await findValidRefreshTokenByHash(db, hash);
    expect(found).toBeUndefined();
  });

  it("returns undefined when token is expired", async () => {
    const { userId, tenantId } = await seedUserAndTenant("find-expired");
    const hash = `hash-${randomUUID()}`;

    // Insert with created_at/expires_at both in the past so the token is
    // already expired but the check constraint (expires_at > created_at) holds.
    await db
      .insertInto("refresh_tokens")
      .values({
        user_id: userId,
        tenant_id: tenantId,
        family_id: randomUUID(),
        token_hash: hash,
        created_at: sql`now() - interval '2 hours'`,
        expires_at: sql`now() - interval '1 hour'`,
      })
      .execute();

    const found = await findValidRefreshTokenByHash(db, hash);
    expect(found).toBeUndefined();
  });

  it("returns undefined when hash does not exist", async () => {
    const found = await findValidRefreshTokenByHash(db, "nonexistent-hash");
    expect(found).toBeUndefined();
  });
});

describe("revokeByFamily", () => {
  it("revokes all active tokens in a family", async () => {
    const { userId, tenantId } = await seedUserAndTenant("revoke-family");
    const familyId = randomUUID();

    const t1 = await createRefreshToken(db, {
      userId,
      tenantId,
      familyId,
      tokenHash: `hash-${randomUUID()}`,
      expiresAt: futureDate(),
    });
    const t2 = await createRefreshToken(db, {
      userId,
      tenantId,
      familyId,
      tokenHash: `hash-${randomUUID()}`,
      expiresAt: futureDate(),
    });

    await revokeByFamily(db, familyId);

    const r1 = await db
      .selectFrom("refresh_tokens")
      .select("revoked_at")
      .where("id", "=", t1.id)
      .executeTakeFirstOrThrow();
    const r2 = await db
      .selectFrom("refresh_tokens")
      .select("revoked_at")
      .where("id", "=", t2.id)
      .executeTakeFirstOrThrow();

    expect(r1.revoked_at).not.toBeNull();
    expect(r2.revoked_at).not.toBeNull();
  });

  it("leaves tokens from other families untouched", async () => {
    const { userId, tenantId } = await seedUserAndTenant("revoke-family-other");
    const targetFamily = randomUUID();
    const otherFamily = randomUUID();

    await createRefreshToken(db, {
      userId,
      tenantId,
      familyId: targetFamily,
      tokenHash: `hash-${randomUUID()}`,
      expiresAt: futureDate(),
    });
    const other = await createRefreshToken(db, {
      userId,
      tenantId,
      familyId: otherFamily,
      tokenHash: `hash-${randomUUID()}`,
      expiresAt: futureDate(),
    });

    await revokeByFamily(db, targetFamily);

    const r = await db
      .selectFrom("refresh_tokens")
      .select("revoked_at")
      .where("id", "=", other.id)
      .executeTakeFirstOrThrow();

    expect(r.revoked_at).toBeNull();
  });

  it("is idempotent", async () => {
    const { userId, tenantId } = await seedUserAndTenant("revoke-family-idempotent");
    const familyId = randomUUID();

    await createRefreshToken(db, {
      userId,
      tenantId,
      familyId,
      tokenHash: `hash-${randomUUID()}`,
      expiresAt: futureDate(),
    });

    await revokeByFamily(db, familyId);
    await expect(revokeByFamily(db, familyId)).resolves.toBeUndefined();
  });
});

describe("revokeAllForUser", () => {
  it("revokes tokens across tenants for the user", async () => {
    const { userId, tenantId: tenantId1 } = await seedUserAndTenant("revoke-all");

    const tenant2 = await db
      .insertInto("tenants")
      .values({ name: `Tenant2-revoke-all-${Date.now()}` })
      .returning("id")
      .executeTakeFirstOrThrow();

    const t1 = await createRefreshToken(db, {
      userId,
      tenantId: tenantId1,
      familyId: randomUUID(),
      tokenHash: `hash-${randomUUID()}`,
      expiresAt: futureDate(),
    });
    const t2 = await createRefreshToken(db, {
      userId,
      tenantId: tenant2.id,
      familyId: randomUUID(),
      tokenHash: `hash-${randomUUID()}`,
      expiresAt: futureDate(),
    });

    await revokeAllForUser(db, userId);

    for (const id of [t1.id, t2.id]) {
      const r = await db
        .selectFrom("refresh_tokens")
        .select("revoked_at")
        .where("id", "=", id)
        .executeTakeFirstOrThrow();
      expect(r.revoked_at).not.toBeNull();
    }
  });

  it("leaves other users' tokens untouched", async () => {
    const { userId: user1 } = await seedUserAndTenant("revoke-all-user1");
    const { userId: user2, tenantId } = await seedUserAndTenant("revoke-all-user2");

    const other = await createRefreshToken(db, {
      userId: user2,
      tenantId,
      familyId: randomUUID(),
      tokenHash: `hash-${randomUUID()}`,
      expiresAt: futureDate(),
    });

    await revokeAllForUser(db, user1);

    const r = await db
      .selectFrom("refresh_tokens")
      .select("revoked_at")
      .where("id", "=", other.id)
      .executeTakeFirstOrThrow();

    expect(r.revoked_at).toBeNull();
  });
});

describe("rotateRefreshToken", () => {
  it("happy path: revokes old token, creates new one with same family_id", async () => {
    const { userId, tenantId } = await seedUserAndTenant("rotate-happy");
    const familyId = randomUUID();
    const oldHash = `hash-${randomUUID()}`;

    const oldToken = await createRefreshToken(db, {
      userId,
      tenantId,
      familyId,
      tokenHash: oldHash,
      expiresAt: futureDate(),
    });

    const newHash = `hash-${randomUUID()}`;
    const newToken = await rotateRefreshToken(db, oldHash, {
      userId,
      tenantId,
      tokenHash: newHash,
      expiresAt: futureDate(),
    });

    expect(newToken.token_hash).toBe(newHash);
    expect(newToken.family_id).toBe(familyId);
    expect(newToken.revoked_at).toBeNull();

    const old = await db
      .selectFrom("refresh_tokens")
      .select("revoked_at")
      .where("token_hash", "=", oldHash)
      .executeTakeFirstOrThrow();
    expect(old.revoked_at).not.toBeNull();

    // oldToken variable used to suppress unused-var lint in strict mode
    void oldToken;
  });

  it("replay attack: revokes entire family and throws UnauthorizedError", async () => {
    const { userId, tenantId } = await seedUserAndTenant("rotate-replay");
    const familyId = randomUUID();
    const oldHash = `hash-${randomUUID()}`;

    const t1 = await createRefreshToken(db, {
      userId,
      tenantId,
      familyId,
      tokenHash: oldHash,
      expiresAt: futureDate(),
    });

    // Rotate once legitimately to get t2
    const newHash = `hash-${randomUUID()}`;
    const t2 = await rotateRefreshToken(db, oldHash, {
      userId,
      tenantId,
      tokenHash: newHash,
      expiresAt: futureDate(),
    });

    // Replay: try to rotate the already-revoked t1 hash
    await expect(
      rotateRefreshToken(db, oldHash, {
        userId,
        tenantId,
        tokenHash: `hash-${randomUUID()}`,
        expiresAt: futureDate(),
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);

    // Both t1 and t2 must now be revoked
    for (const id of [t1.id, t2.id]) {
      const r = await db
        .selectFrom("refresh_tokens")
        .select("revoked_at")
        .where("id", "=", id)
        .executeTakeFirstOrThrow();
      expect(r.revoked_at).not.toBeNull();
    }
  });

  it("missing hash → UnauthorizedError", async () => {
    const { userId, tenantId } = await seedUserAndTenant("rotate-missing");

    await expect(
      rotateRefreshToken(db, "nonexistent-hash", {
        userId,
        tenantId,
        tokenHash: `hash-${randomUUID()}`,
        expiresAt: futureDate(),
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

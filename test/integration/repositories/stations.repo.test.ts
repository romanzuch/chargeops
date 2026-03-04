import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "dotenv/config";
import { sql } from "kysely";
import { createDb, destroyDb } from "../../../src/db/kysely.js";
import {
  createStation,
  updateStation,
  findStationById,
  findPublicStations,
  findPublicStationById,
  findStationsByTenant,
  findStationByIdForTenant,
} from "../../../src/repositories/stations.repo.js";
import type { Kysely } from "kysely";
import type { Database } from "../../../src/db/types.js";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

let db: Kysely<Database>;
const createdTenantIds: string[] = [];

async function seedTenant(label: string): Promise<string> {
  const row = await db
    .insertInto("tenants")
    .values({ name: `Tenant-${label}-${Date.now()}` })
    .returning("id")
    .executeTakeFirstOrThrow();
  createdTenantIds.push(row.id);
  return row.id;
}

async function softDelete(stationId: string): Promise<void> {
  await db
    .updateTable("stations")
    .set({ deleted_at: sql<Date>`now()` })
    .where("id", "=", stationId)
    .execute();
}

beforeAll(() => {
  db = createDb(requireEnv("DATABASE_URL"));
});

afterAll(async () => {
  // Deleting tenants cascades to all their stations (including soft-deleted ones).
  if (createdTenantIds.length > 0) {
    await db.deleteFrom("tenants").where("id", "in", createdTenantIds).execute();
  }
  await destroyDb();
});

describe("createStation", () => {
  it("happy path: returns full row with DB defaults", async () => {
    const tenantId = await seedTenant("create-happy");
    const row = await createStation(db, { tenantId, name: "Station A" });

    expect(row.id).toBeTruthy();
    expect(row.tenant_id).toBe(tenantId);
    expect(row.name).toBe("Station A");
    expect(row.status).toBe("active");
    expect(row.visibility).toBe("public");
    expect(row.external_id).toBeNull();
    expect(row.location_id).toBeNull();
    expect(row.deleted_at).toBeNull();
    expect(row.created_at).toBeInstanceOf(Date);
    expect(row.updated_at).toBeInstanceOf(Date);
  });

  it("stores all optional fields when provided", async () => {
    const tenantId = await seedTenant("create-full");
    const row = await createStation(db, {
      tenantId,
      name: "Station B",
      externalId: "ext-123",
      status: "planning",
      visibility: "private",
    });

    expect(row.external_id).toBe("ext-123");
    expect(row.status).toBe("planning");
    expect(row.visibility).toBe("private");
  });
});

describe("findStationById", () => {
  it("returns the station for the correct tenant", async () => {
    const tenantId = await seedTenant("find-by-id-happy");
    const created = await createStation(db, { tenantId, name: "Find Me" });

    const found = await findStationById(db, created.id, tenantId);
    expect(found).toBeDefined();
    expect(found!.id).toBe(created.id);
  });

  it("returns undefined for a different tenant", async () => {
    const tenantId = await seedTenant("find-by-id-wrong-tenant-owner");
    const otherTenantId = await seedTenant("find-by-id-wrong-tenant-other");
    const created = await createStation(db, { tenantId, name: "Not Yours" });

    const found = await findStationById(db, created.id, otherTenantId);
    expect(found).toBeUndefined();
  });

  it("returns undefined for an unknown station id", async () => {
    const tenantId = await seedTenant("find-by-id-unknown");
    const found = await findStationById(db, "00000000-0000-0000-0000-000000000000", tenantId);
    expect(found).toBeUndefined();
  });

  it("returns undefined for a soft-deleted station", async () => {
    const tenantId = await seedTenant("find-by-id-deleted");
    const created = await createStation(db, { tenantId, name: "Deleted Station" });
    await softDelete(created.id);

    const found = await findStationById(db, created.id, tenantId);
    expect(found).toBeUndefined();
  });
});

describe("updateStation", () => {
  it("happy path: updates fields and returns the updated row", async () => {
    const tenantId = await seedTenant("update-happy");
    const created = await createStation(db, { tenantId, name: "Before" });

    const updated = await updateStation(db, created.id, tenantId, {
      name: "After",
      status: "inactive",
      visibility: "private",
    });

    expect(updated).toBeDefined();
    expect(updated!.name).toBe("After");
    expect(updated!.status).toBe("inactive");
    expect(updated!.visibility).toBe("private");
    expect(updated!.updated_at.getTime()).toBeGreaterThanOrEqual(created.updated_at.getTime());
  });

  it("partial update: only provided fields are changed", async () => {
    const tenantId = await seedTenant("update-partial");
    const created = await createStation(db, {
      tenantId,
      name: "Partial",
      status: "active",
      visibility: "public",
    });

    const updated = await updateStation(db, created.id, tenantId, { name: "Partial Updated" });

    expect(updated!.name).toBe("Partial Updated");
    expect(updated!.status).toBe("active");
    expect(updated!.visibility).toBe("public");
  });

  it("returns undefined for a different tenant", async () => {
    const tenantId = await seedTenant("update-wrong-tenant-owner");
    const otherTenantId = await seedTenant("update-wrong-tenant-other");
    const created = await createStation(db, { tenantId, name: "Not Yours" });

    const result = await updateStation(db, created.id, otherTenantId, { name: "Hijacked" });
    expect(result).toBeUndefined();
  });

  it("returns undefined for an unknown station id", async () => {
    const tenantId = await seedTenant("update-unknown");
    const result = await updateStation(db, "00000000-0000-0000-0000-000000000000", tenantId, {
      name: "Ghost",
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined for a soft-deleted station", async () => {
    const tenantId = await seedTenant("update-deleted");
    const created = await createStation(db, { tenantId, name: "Will Be Deleted" });
    await softDelete(created.id);

    const result = await updateStation(db, created.id, tenantId, { name: "Too Late" });
    expect(result).toBeUndefined();
  });
});

describe("findPublicStations", () => {
  it("returns only public, non-deleted stations", async () => {
    const tenantId = await seedTenant("find-public-list");
    const pub1 = await createStation(db, { tenantId, name: "Public 1", visibility: "public" });
    const pub2 = await createStation(db, { tenantId, name: "Public 2", visibility: "public" });
    const priv = await createStation(db, { tenantId, name: "Private", visibility: "private" });
    const deleted = await createStation(db, { tenantId, name: "Deleted", visibility: "public" });
    await softDelete(deleted.id);

    const results = await findPublicStations(db, { limit: 50, offset: 0 });
    const ids = results.rows.map((s) => s.id);

    expect(ids).toContain(pub1.id);
    expect(ids).toContain(pub2.id);
    expect(ids).not.toContain(priv.id);
    expect(ids).not.toContain(deleted.id);
  });
});

describe("findStationsByTenant", () => {
  it("returns all non-deleted stations for the tenant regardless of visibility", async () => {
    const tenantId = await seedTenant("find-tenant-list");
    const pub = await createStation(db, { tenantId, name: "Public", visibility: "public" });
    const priv = await createStation(db, { tenantId, name: "Private", visibility: "private" });
    const deleted = await createStation(db, { tenantId, name: "Deleted", visibility: "public" });
    await softDelete(deleted.id);

    const results = await findStationsByTenant(db, tenantId, { limit: 50, offset: 0 });
    const ids = results.rows.map((s) => s.id);

    expect(ids).toContain(pub.id);
    expect(ids).toContain(priv.id);
    expect(ids).not.toContain(deleted.id);
  });

  it("excludes stations belonging to other tenants", async () => {
    const tenantId = await seedTenant("find-tenant-isolation-owner");
    const otherTenantId = await seedTenant("find-tenant-isolation-other");
    const mine = await createStation(db, { tenantId, name: "Mine" });
    const theirs = await createStation(db, { tenantId: otherTenantId, name: "Theirs" });

    const results = await findStationsByTenant(db, tenantId, { limit: 50, offset: 0 });
    const ids = results.rows.map((s) => s.id);

    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(theirs.id);
  });
});

describe("findStationByIdForTenant", () => {
  it("returns a public station for the correct tenant", async () => {
    const tenantId = await seedTenant("find-tenant-by-id-public");
    const station = await createStation(db, { tenantId, name: "Public", visibility: "public" });

    const found = await findStationByIdForTenant(db, station.id, tenantId);
    expect(found).toBeDefined();
    expect(found!.id).toBe(station.id);
  });

  it("returns a private station for the correct tenant", async () => {
    const tenantId = await seedTenant("find-tenant-by-id-private");
    const station = await createStation(db, { tenantId, name: "Private", visibility: "private" });

    const found = await findStationByIdForTenant(db, station.id, tenantId);
    expect(found).toBeDefined();
    expect(found!.id).toBe(station.id);
  });

  it("returns undefined for a station belonging to another tenant", async () => {
    const tenantId = await seedTenant("find-tenant-by-id-wrong-owner");
    const otherTenantId = await seedTenant("find-tenant-by-id-wrong-other");
    const station = await createStation(db, { tenantId, name: "Not Yours" });

    const found = await findStationByIdForTenant(db, station.id, otherTenantId);
    expect(found).toBeUndefined();
  });

  it("returns undefined for a soft-deleted station", async () => {
    const tenantId = await seedTenant("find-tenant-by-id-deleted");
    const station = await createStation(db, { tenantId, name: "Deleted" });
    await softDelete(station.id);

    const found = await findStationByIdForTenant(db, station.id, tenantId);
    expect(found).toBeUndefined();
  });
});

describe("findPublicStationById", () => {
  it("returns a public station by id", async () => {
    const tenantId = await seedTenant("find-public-by-id-happy");
    const station = await createStation(db, { tenantId, name: "Public", visibility: "public" });

    const found = await findPublicStationById(db, station.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(station.id);
  });

  it("returns undefined for a private station", async () => {
    const tenantId = await seedTenant("find-public-by-id-private");
    const station = await createStation(db, { tenantId, name: "Private", visibility: "private" });

    const found = await findPublicStationById(db, station.id);
    expect(found).toBeUndefined();
  });

  it("returns undefined for an unknown station id", async () => {
    const found = await findPublicStationById(db, "00000000-0000-0000-0000-000000000000");
    expect(found).toBeUndefined();
  });

  it("returns undefined for a soft-deleted public station", async () => {
    const tenantId = await seedTenant("find-public-by-id-deleted");
    const station = await createStation(db, {
      tenantId,
      name: "Deleted Public",
      visibility: "public",
    });
    await softDelete(station.id);

    const found = await findPublicStationById(db, station.id);
    expect(found).toBeUndefined();
  });
});

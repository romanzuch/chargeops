import { describe, it, expect, vi } from "vitest";
import type { Kysely, Selectable } from "kysely";
import type { Database, StationsTable } from "../../../src/db/types.js";
import {
  createStation,
  updateStation,
  findStationById,
  findPublicStations,
  findPublicStationById,
} from "../../../src/repositories/stations.repo.js";

/** Minimal valid station row returned from the DB. */
function makeStation(
  overrides: Partial<Selectable<StationsTable>> = {},
): Selectable<StationsTable> {
  return {
    id: "station-1",
    tenant_id: "tenant-1",
    name: "Test Station",
    external_id: null,
    location_id: null,
    status: "active",
    visibility: "public",
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-01"),
    deleted_at: null,
    ...overrides,
  };
}

/**
 * Creates a Proxy-based Kysely mock where every builder method chains
 * (returns another proxy) and the terminal execute methods resolve with
 * `executeResult`. Args passed to each builder method are recorded in
 * `captured` by method name (last call wins for repeated methods like .where()).
 *
 * @param executeResult - returned by `.execute()` and `.executeTakeFirst()`
 * @param executeTakeFirstOrThrowResult - if provided, returned by `.executeTakeFirstOrThrow()`
 *   instead of `executeResult`. Useful for testing queries that use Promise.all
 *   with both .execute() and .executeTakeFirstOrThrow() (e.g. paginated queries).
 */
function makeCapturingDb(executeResult: unknown, executeTakeFirstOrThrowResult?: unknown) {
  const captured = new Map<string, unknown[]>();

  const handler: ProxyHandler<object> = {
    get(_, prop: string) {
      if (prop === "executeTakeFirstOrThrow") {
        return vi.fn().mockResolvedValue(executeTakeFirstOrThrowResult ?? executeResult);
      }
      if (["execute", "executeTakeFirst"].includes(prop)) {
        return vi.fn().mockResolvedValue(executeResult);
      }
      return vi.fn((...args: unknown[]) => {
        captured.set(prop, args);
        return new Proxy({}, handler);
      });
    },
  };

  return { db: new Proxy({}, handler) as Kysely<Database>, captured };
}

// ─── createStation ────────────────────────────────────────────────────────────

describe("createStation", () => {
  it("returns the station row from the DB", async () => {
    const station = makeStation();
    const { db } = makeCapturingDb(station);

    const result = await createStation(db, { tenantId: "t1", name: "Station A" });

    expect(result).toBe(station);
  });

  it("sends only required fields in VALUES when optional fields are omitted", async () => {
    const { db, captured } = makeCapturingDb(makeStation());

    await createStation(db, { tenantId: "t1", name: "Station A" });

    const [values] = captured.get("values") as [Record<string, unknown>];
    expect(values).toEqual({ tenant_id: "t1", name: "Station A" });
    expect(values).not.toHaveProperty("external_id");
    expect(values).not.toHaveProperty("location_id");
    expect(values).not.toHaveProperty("status");
    expect(values).not.toHaveProperty("visibility");
  });

  it("includes all optional fields in VALUES when provided", async () => {
    const { db, captured } = makeCapturingDb(makeStation());

    await createStation(db, {
      tenantId: "t1",
      name: "Station B",
      externalId: "ext-1",
      status: "planning",
      visibility: "private",
    });

    const [values] = captured.get("values") as [Record<string, unknown>];
    expect(values).toMatchObject({
      tenant_id: "t1",
      name: "Station B",
      external_id: "ext-1",
      status: "planning",
      visibility: "private",
    });
  });
});

// ─── updateStation ────────────────────────────────────────────────────────────

describe("updateStation", () => {
  it("returns the updated station from the DB", async () => {
    const station = makeStation({ name: "Updated" });
    const { db } = makeCapturingDb(station);

    const result = await updateStation(db, "station-1", "tenant-1", { name: "Updated" });

    expect(result).toBe(station);
  });

  it("returns undefined when the DB returns undefined (not found / wrong tenant)", async () => {
    const { db } = makeCapturingDb(undefined);

    const result = await updateStation(db, "station-1", "tenant-1", { name: "X" });

    expect(result).toBeUndefined();
  });

  it("only includes provided fields in SET, always includes updated_at", async () => {
    const { db, captured } = makeCapturingDb(makeStation());

    await updateStation(db, "station-1", "tenant-1", { name: "New Name" });

    const [setValues] = captured.get("set") as [Record<string, unknown>];
    expect(setValues).toHaveProperty("name", "New Name");
    expect(setValues).toHaveProperty("updated_at"); // always present (sql`now()`)
    expect(setValues).not.toHaveProperty("external_id");
    expect(setValues).not.toHaveProperty("location_id");
    expect(setValues).not.toHaveProperty("status");
    expect(setValues).not.toHaveProperty("visibility");
  });
});

// ─── findStationById ──────────────────────────────────────────────────────────

describe("findStationById", () => {
  it("returns the station when found", async () => {
    const station = makeStation();
    const { db } = makeCapturingDb(station);

    const result = await findStationById(db, "station-1", "tenant-1");

    expect(result).toBe(station);
  });

  it("returns undefined when not found", async () => {
    const { db } = makeCapturingDb(undefined);

    const result = await findStationById(db, "station-1", "tenant-1");

    expect(result).toBeUndefined();
  });
});

// ─── findPublicStations ───────────────────────────────────────────────────────

describe("findPublicStations", () => {
  const pagination = { limit: 20, offset: 0 };

  it("returns the array of stations from the DB", async () => {
    const stations = [makeStation({ id: "s1" }), makeStation({ id: "s2" })];
    const { db } = makeCapturingDb(stations, { total: "2" });

    const result = await findPublicStations(db, pagination);

    expect(result.rows).toEqual(stations);
    expect(result.total).toBe(2);
  });

  it("returns an empty array when the DB returns none", async () => {
    const { db } = makeCapturingDb([], { total: "0" });

    const result = await findPublicStations(db, pagination);

    expect(result.rows).toEqual([]);
    expect(result.total).toBe(0);
  });
});

// ─── findPublicStationById ────────────────────────────────────────────────────

describe("findPublicStationById", () => {
  it("returns the station when found", async () => {
    const station = makeStation({ visibility: "public" });
    const { db } = makeCapturingDb(station);

    const result = await findPublicStationById(db, "station-1");

    expect(result).toBe(station);
  });

  it("returns undefined when not found", async () => {
    const { db } = makeCapturingDb(undefined);

    const result = await findPublicStationById(db, "station-1");

    expect(result).toBeUndefined();
  });
});

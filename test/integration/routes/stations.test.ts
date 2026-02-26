import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "dotenv/config";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../../src/app.js";
import { getDb } from "../../../src/db/kysely.js";
import type { Database } from "../../../src/db/types.js";
import type { Kysely } from "kysely";

/**
 * Integration tests for station endpoints.
 *
 * Covers:
 * - Public read endpoints (no auth)
 * - Role enforcement on writes (tenant_admin only)
 * - Tenant-scoped read endpoints (all tenant roles)
 * - Cross-tenant isolation on writes
 */

describe("Station Endpoints", () => {
  let app: FastifyInstance;
  let db: Kysely<Database>;
  let testTenantId: string;
  let adminAccessToken: string;
  let viewerAccessToken: string;
  let driverAccessToken: string;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
    db = getDb();

    await _cleanupTestData();

    // Create a test tenant
    const tenant = await db
      .insertInto("tenants")
      .values({ name: "Station Test Tenant" })
      .returning("id")
      .executeTakeFirstOrThrow();
    testTenantId = tenant.id;

    // Register three users and manually set their roles
    const register = async (email: string) => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email, password: "StrongPassword123", tenantId: testTenantId },
      });
      return res.json<{ accessToken: string }>().accessToken;
    };

    // All three start as tenant_view (default on register)
    const adminToken = await register("stations-admin@example.com");
    const viewerToken = await register("stations-viewer@example.com");
    const driverToken = await register("stations-driver@example.com");

    // Promote admin user to tenant_admin
    await db
      .updateTable("user_tenant_roles")
      .set({ role: "tenant_admin" })
      .where("tenant_id", "=", testTenantId)
      .where(
        "user_id",
        "=",
        db.selectFrom("users").select("id").where("email", "=", "stations-admin@example.com"),
      )
      .execute();

    // Set driver user's role
    await db
      .updateTable("user_tenant_roles")
      .set({ role: "driver" })
      .where("tenant_id", "=", testTenantId)
      .where(
        "user_id",
        "=",
        db.selectFrom("users").select("id").where("email", "=", "stations-driver@example.com"),
      )
      .execute();

    // Re-login to get fresh tokens after role changes
    // (roles are checked per-request from DB, so existing tokens are fine)
    adminAccessToken = adminToken;
    viewerAccessToken = viewerToken;
    driverAccessToken = driverToken;
  });

  afterAll(async () => {
    await _cleanupTestData();
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // Public read endpoints
  // ---------------------------------------------------------------------------

  describe("GET /stations (public)", () => {
    it("returns public stations without auth", async () => {
      const res = await app.inject({ method: "GET", url: "/stations" });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json().data)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Role enforcement on writes
  // ---------------------------------------------------------------------------

  describe("POST /stations — role enforcement", () => {
    it("allows tenant_admin to create a station", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/stations",
        headers: { authorization: `Bearer ${adminAccessToken}` },
        payload: { name: "Admin Station" },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.name).toBe("Admin Station");
      expect(body.tenantId).toBe(testTenantId);
    });

    it("returns 403 for tenant_view user", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/stations",
        headers: { authorization: `Bearer ${viewerAccessToken}` },
        payload: { name: "Viewer Station" },
      });

      expect(res.statusCode).toBe(403);
    });

    it("returns 403 for driver user", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/stations",
        headers: { authorization: `Bearer ${driverAccessToken}` },
        payload: { name: "Driver Station" },
      });

      expect(res.statusCode).toBe(403);
    });

    it("returns 401 without token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/stations",
        payload: { name: "Anon Station" },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("PATCH /stations/:id — role enforcement", () => {
    it("allows tenant_admin to update a station", async () => {
      // Create a station first
      const createRes = await app.inject({
        method: "POST",
        url: "/stations",
        headers: { authorization: `Bearer ${adminAccessToken}` },
        payload: { name: "Before Update" },
      });
      expect(createRes.statusCode).toBe(201);
      const stationId = createRes.json<{ id: string }>().id;

      const res = await app.inject({
        method: "PATCH",
        url: `/stations/${stationId}`,
        headers: { authorization: `Bearer ${adminAccessToken}` },
        payload: { name: "After Update" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().name).toBe("After Update");
    });

    it("returns 403 for tenant_view user", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/stations",
        headers: { authorization: `Bearer ${adminAccessToken}` },
        payload: { name: "Target Station" },
      });
      const stationId = createRes.json<{ id: string }>().id;

      const res = await app.inject({
        method: "PATCH",
        url: `/stations/${stationId}`,
        headers: { authorization: `Bearer ${viewerAccessToken}` },
        payload: { name: "Hijacked" },
      });

      expect(res.statusCode).toBe(403);
    });

    it("returns 403 for driver user", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/stations",
        headers: { authorization: `Bearer ${adminAccessToken}` },
        payload: { name: "Driver Target" },
      });
      const stationId = createRes.json<{ id: string }>().id;

      const res = await app.inject({
        method: "PATCH",
        url: `/stations/${stationId}`,
        headers: { authorization: `Bearer ${driverAccessToken}` },
        payload: { name: "Driver Hijacked" },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------
  // Tenant-scoped read endpoints — all roles can read
  // ---------------------------------------------------------------------------

  describe("GET /tenant/stations", () => {
    it("allows tenant_admin to list tenant stations (incl. private)", async () => {
      // Create a private station
      await app.inject({
        method: "POST",
        url: "/stations",
        headers: { authorization: `Bearer ${adminAccessToken}` },
        payload: { name: "Private Station", visibility: "private" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/tenant/stations",
        headers: { authorization: `Bearer ${adminAccessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const stations = res.json<{ data: { visibility: string }[] }>().data;
      expect(Array.isArray(stations)).toBe(true);
      const hasPrivate = stations.some((s) => s.visibility === "private");
      expect(hasPrivate).toBe(true);
    });

    it("allows tenant_view to list tenant stations", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/tenant/stations",
        headers: { authorization: `Bearer ${viewerAccessToken}` },
      });

      expect(res.statusCode).toBe(200);
    });

    it("allows driver to list tenant stations", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/tenant/stations",
        headers: { authorization: `Bearer ${driverAccessToken}` },
      });

      expect(res.statusCode).toBe(200);
    });

    it("returns 401 without token", async () => {
      const res = await app.inject({ method: "GET", url: "/tenant/stations" });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /tenant/stations/:id", () => {
    it("allows driver to fetch a private station by id", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/stations",
        headers: { authorization: `Bearer ${adminAccessToken}` },
        payload: { name: "Private For Driver", visibility: "private" },
      });
      const stationId = createRes.json<{ id: string }>().id;

      const res = await app.inject({
        method: "GET",
        url: `/tenant/stations/${stationId}`,
        headers: { authorization: `Bearer ${driverAccessToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe(stationId);
    });

    it("returns 404 for a station from another tenant", async () => {
      // Create a station in a second tenant
      const otherTenant = await db
        .insertInto("tenants")
        .values({ name: "Station Test Other Tenant" })
        .returning("id")
        .executeTakeFirstOrThrow();

      const otherStation = await db
        .insertInto("stations")
        .values({ tenant_id: otherTenant.id, name: "Other Tenant Station" })
        .returning("id")
        .executeTakeFirstOrThrow();

      const res = await app.inject({
        method: "GET",
        url: `/tenant/stations/${otherStation.id}`,
        headers: { authorization: `Bearer ${adminAccessToken}` },
      });

      expect(res.statusCode).toBe(404);

      // Cleanup other tenant
      await db.deleteFrom("stations").where("id", "=", otherStation.id).execute();
      await db.deleteFrom("tenants").where("id", "=", otherTenant.id).execute();
    });
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  async function _cleanupTestData(): Promise<void> {
    try {
      const userEmails = [
        "stations-admin@example.com",
        "stations-viewer@example.com",
        "stations-driver@example.com",
      ];

      await db
        .deleteFrom("refresh_tokens")
        .where(
          "user_id",
          "in",
          db.selectFrom("users").select("id").where("email", "in", userEmails),
        )
        .execute();

      await db
        .deleteFrom("stations")
        .where(
          "tenant_id",
          "in",
          db
            .selectFrom("tenants")
            .select("id")
            .where("name", "in", ["Station Test Tenant", "Station Test Other Tenant"]),
        )
        .execute();

      await db
        .deleteFrom("user_tenant_roles")
        .where(
          "user_id",
          "in",
          db.selectFrom("users").select("id").where("email", "in", userEmails),
        )
        .execute();

      await db.deleteFrom("users").where("email", "in", userEmails).execute();

      await db
        .deleteFrom("tenants")
        .where("name", "in", ["Station Test Tenant", "Station Test Other Tenant"])
        .execute();
    } catch (err) {
      console.error("Cleanup error (ignored):", err);
    }
  }
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "dotenv/config";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../../src/app.js";
import { getDb } from "../../../src/db/kysely.js";
import type { Database } from "../../../src/db/types.js";
import type { Kysely } from "kysely";

/**
 * Integration tests for tenant user management endpoints.
 *
 * - GET  /tenant/users              — list members (tenant_admin only)
 * - PATCH /tenant/users/:userId/role — update role (tenant_admin only)
 *
 * Role transition rules verified:
 * - tenant_view → tenant_admin  ✅
 * - tenant_admin → tenant_view  ✅
 * - * → driver                  ❌ (400)
 * - self change                 ❌ (403)
 * - unknown user                ❌ (404)
 */

describe("Tenant User Management Endpoints", () => {
  let app: FastifyInstance;
  let db: Kysely<Database>;
  let testTenantId: string;
  let adminToken: string;
  let adminUserId: string;
  let viewerToken: string;
  let viewerUserId: string;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
    db = getDb();

    await _cleanupTestData();

    // Create test tenant
    const tenant = await db
      .insertInto("tenants")
      .values({ name: "User Mgmt Test Tenant" })
      .returning("id")
      .executeTakeFirstOrThrow();
    testTenantId = tenant.id;

    // Register admin user (starts as tenant_view, promote manually)
    const adminRes = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "useradmin@example.com",
        password: "StrongPassword123",
        tenantId: testTenantId,
      },
    });
    adminToken = adminRes.json<{ accessToken: string }>().accessToken;
    const adminUser = await db
      .selectFrom("users")
      .select("id")
      .where("email", "=", "useradmin@example.com")
      .executeTakeFirstOrThrow();
    adminUserId = adminUser.id;

    await db
      .updateTable("user_tenant_roles")
      .set({ role: "tenant_admin" })
      .where("user_id", "=", adminUserId)
      .where("tenant_id", "=", testTenantId)
      .execute();

    // Register viewer user
    const viewerRes = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "userviewer@example.com",
        password: "StrongPassword123",
        tenantId: testTenantId,
      },
    });
    viewerToken = viewerRes.json<{ accessToken: string }>().accessToken;
    const viewerUser = await db
      .selectFrom("users")
      .select("id")
      .where("email", "=", "userviewer@example.com")
      .executeTakeFirstOrThrow();
    viewerUserId = viewerUser.id;
  });

  afterAll(async () => {
    await _cleanupTestData();
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // GET /tenant/users
  // ---------------------------------------------------------------------------

  describe("GET /tenant/users", () => {
    it("returns the tenant member list for a tenant_admin", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/tenant/users",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ userId: string; email: string; role: string; memberSince: string }[]>();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(2);

      const admin = body.find((u) => u.userId === adminUserId);
      expect(admin).toBeDefined();
      expect(admin!.role).toBe("tenant_admin");
      expect(admin!.email).toBe("useradmin@example.com");
      expect(typeof admin!.memberSince).toBe("string");

      const viewer = body.find((u) => u.userId === viewerUserId);
      expect(viewer).toBeDefined();
      expect(viewer!.role).toBe("tenant_view");
    });

    it("returns 403 for a tenant_view user", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/tenant/users",
        headers: { authorization: `Bearer ${viewerToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it("returns 401 without a token", async () => {
      const res = await app.inject({ method: "GET", url: "/tenant/users" });
      expect(res.statusCode).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /tenant/users/:userId/role
  // ---------------------------------------------------------------------------

  describe("PATCH /tenant/users/:userId/role", () => {
    it("promotes tenant_view to tenant_admin", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/tenant/users/${viewerUserId}/role`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { role: "tenant_admin" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ userId: string; role: string }>();
      expect(body.userId).toBe(viewerUserId);
      expect(body.role).toBe("tenant_admin");
    });

    it("demotes tenant_admin back to tenant_view", async () => {
      // viewer is now tenant_admin from the previous test — demote back
      const res = await app.inject({
        method: "PATCH",
        url: `/tenant/users/${viewerUserId}/role`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { role: "tenant_view" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json<{ role: string }>().role).toBe("tenant_view");
    });

    it("returns 400 when role is 'driver'", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/tenant/users/${viewerUserId}/role`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { role: "driver" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when role is an arbitrary invalid string", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/tenant/users/${viewerUserId}/role`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { role: "super_admin" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when role field is missing", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/tenant/users/${viewerUserId}/role`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 403 when changing own role", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/tenant/users/${adminUserId}/role`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { role: "tenant_view" },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().detail).toContain("own role");
    });

    it("returns 403 for a tenant_view user attempting to change roles", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/tenant/users/${adminUserId}/role`,
        headers: { authorization: `Bearer ${viewerToken}` },
        payload: { role: "tenant_view" },
      });

      expect(res.statusCode).toBe(403);
    });

    it("returns 404 for a userId not in the tenant", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/tenant/users/00000000-0000-4000-8000-000000000000/role",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { role: "tenant_view" },
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 401 without a token", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/tenant/users/${viewerUserId}/role`,
        payload: { role: "tenant_admin" },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  async function _cleanupTestData(): Promise<void> {
    try {
      const testEmails = ["useradmin@example.com", "userviewer@example.com"];

      await db
        .deleteFrom("refresh_tokens")
        .where(
          "user_id",
          "in",
          db.selectFrom("users").select("id").where("email", "in", testEmails),
        )
        .execute();

      await db
        .deleteFrom("user_tenant_roles")
        .where(
          "user_id",
          "in",
          db.selectFrom("users").select("id").where("email", "in", testEmails),
        )
        .execute();

      await db.deleteFrom("users").where("email", "in", testEmails).execute();
      await db.deleteFrom("tenants").where("name", "=", "User Mgmt Test Tenant").execute();
    } catch (err) {
      console.error("Cleanup error (ignored):", err);
    }
  }
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "dotenv/config";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../../src/app.js";
import { signAccessToken } from "../../../src/services/jwt.service.js";

/**
 * Integration tests for the tenant context middleware (OMS-19).
 *
 * Registers a lightweight protected route that runs the full
 * verifyJwt + verifyTenant preHandler chain. Tokens are signed directly
 * with `signAccessToken` to avoid any DB dependency (no register/login).
 *
 * Scenarios (DoD):
 * - No token                              → 401
 * - Valid token, no x-tenant-id header    → 200
 * - Valid token, matching header          → 200
 * - Valid token, mismatched header        → 403
 * - Public route (GET /health)            → 200 (bypasses tenant middleware)
 */

const JWT_SECRET = process.env["JWT_SECRET"] ?? "";
const TTL = 900;
const TEST_USER_ID = "test-user-oms19";
const TEST_TENANT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const OTHER_TENANT_ID = "00000000-0000-0000-0000-000000000000";

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET must be set (add it to .env.test)");
}

describe("Tenant Context Middleware (verifyTenant preHandler)", () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = buildApp();

    // Register a lightweight protected route for this test suite.
    // Does not touch the database — just returns the resolved tenantId.
    await app.register(async (scope) => {
      scope.get(
        "/test/tenant-protected",
        { preHandler: [app.verifyJwt, app.verifyTenant] },
        async (req) => {
          return { tenantId: req.tenantId };
        },
      );
    });

    await app.ready();

    token = await signAccessToken(
      { userId: TEST_USER_ID, tenantId: TEST_TENANT_ID },
      JWT_SECRET,
      TTL,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  describe("no token → 401", () => {
    it("returns 401 when no Authorization header is provided", async () => {
      const res = await app.inject({ method: "GET", url: "/test/tenant-protected" });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("valid token, no x-tenant-id header → 200", () => {
    it("resolves tenantId from token and returns 200", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/test/tenant-protected",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ tenantId: TEST_TENANT_ID });
    });
  });

  describe("valid token, matching x-tenant-id header → 200", () => {
    it("accepts request when header matches token tid", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/test/tenant-protected",
        headers: {
          authorization: `Bearer ${token}`,
          "x-tenant-id": TEST_TENANT_ID,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ tenantId: TEST_TENANT_ID });
    });
  });

  describe("valid token, mismatched x-tenant-id header → 403", () => {
    it("returns 403 Forbidden when header tenant does not match token tid", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/test/tenant-protected",
        headers: {
          authorization: `Bearer ${token}`,
          "x-tenant-id": OTHER_TENANT_ID,
        },
      });

      expect(res.statusCode).toBe(403);
      const body = res.json<{ title: string; detail: string }>();
      expect(body.title).toBe("Forbidden");
      expect(body.detail).toMatch(/x-tenant-id/);
    });
  });

  describe("public route bypass", () => {
    it("GET /health returns 200 without any auth (tenant middleware not applied)", async () => {
      const res = await app.inject({ method: "GET", url: "/health" });

      expect(res.statusCode).toBe(200);
    });
  });
});

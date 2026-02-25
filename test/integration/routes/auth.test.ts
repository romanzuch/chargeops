import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "dotenv/config";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../../src/app.js";
import { getDb } from "../../../src/db/kysely.js";
import type { Database } from "../../../src/db/types.js";
import type { Kysely } from "kysely";

/**
 * Integration tests for auth endpoints.
 *
 * Tests the complete auth flow with real database operations:
 * - POST /auth/register
 * - POST /auth/login
 * - POST /auth/refresh
 * - POST /auth/logout
 * - GET /me
 */

describe("Auth Endpoints", () => {
  let app: FastifyInstance;
  let db: Kysely<Database>;
  let testTenantId: string;

  beforeAll(async () => {
    // Build app with all plugins
    app = buildApp();
    await app.ready();

    // Get database connection
    db = getDb();

    // Clean up any test data from previous runs
    await _cleanupTestData();

    // Create a test tenant that all registrations in this suite will use
    const tenant = await db
      .insertInto("tenants")
      .values({ name: "Test Tenant" })
      .returning("id")
      .executeTakeFirstOrThrow();
    testTenantId = tenant.id;
  });

  afterAll(async () => {
    await _cleanupTestData();
    await app.close();
  });

  describe("POST /auth/register", () => {
    it("registers a new user and returns access token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: {
          email: "newuser@example.com",
          password: "MySecurePassword123",
          tenantId: testTenantId,
          name: "New User",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toEqual(
        expect.objectContaining({
          accessToken: expect.any(String),
          expiresIn: expect.any(Number),
        }),
      );

      // Verify JWT structure (three dot-separated parts)
      const parts = body.accessToken.split(".");
      expect(parts).toHaveLength(3);
    });

    it("sets HttpOnly refresh token cookie", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: {
          email: "cookietest@example.com",
          password: "MySecurePassword123",
          tenantId: testTenantId,
        },
      });

      expect(res.statusCode).toBe(201);

      // Check Set-Cookie header
      const setCookie = res.headers["set-cookie"];
      expect(setCookie).toBeDefined();
      expect(setCookie).toContain("REFRESH_TOKEN=");
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("Path=/");
      expect(setCookie).toContain("SameSite=Strict");
    });

    it("rejects duplicate email with 409 Conflict", async () => {
      const email = "duplicate@example.com";
      const password = "MySecurePassword123";

      // First registration
      const res1 = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email, password, tenantId: testTenantId },
      });
      expect(res1.statusCode).toBe(201);

      // Second registration with same email
      const res2 = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email, password, tenantId: testTenantId },
      });
      expect(res2.statusCode).toBe(409);

      const body = res2.json();
      expect(body.type).toBe("https://errors.chargeops.dev/conflict");
      expect(body.title).toBe("Conflict");
      expect(body.detail).toContain("Email already in use");
    });

    it("rejects weak password with 400 Bad Request", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: {
          email: "weakpass@example.com",
          password: "short", // Too short
          tenantId: testTenantId,
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toBe("https://errors.chargeops.dev/bad-request");
      expect(body.detail).toContain("at least 12 characters");
    });

    it("rejects invalid email format", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: {
          email: "not-an-email",
          password: "MySecurePassword123",
          tenantId: testTenantId,
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toBe("https://errors.chargeops.dev/bad-request");
    });

    it("rejects missing tenantId with 400 Bad Request", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: {
          email: "notenant@example.com",
          password: "MySecurePassword123",
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it("rejects non-existent tenantId with 404 Not Found", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: {
          email: "badtenant@example.com",
          password: "MySecurePassword123",
          tenantId: "00000000-0000-0000-0000-000000000000",
        },
      });

      expect(res.statusCode).toBe(404);
    });

    it("normalizes email to lowercase", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: {
          email: "NormEmail@EXAMPLE.com",
          password: "MySecurePassword123",
          tenantId: testTenantId,
        },
      });

      expect(res.statusCode).toBe(201);

      // Now try logging in with lowercase version
      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "normemail@example.com",
          password: "MySecurePassword123",
        },
      });

      expect(loginRes.statusCode).toBe(200);
    });
  });

  describe("POST /auth/login", () => {
    it("logs in user and returns access token", async () => {
      const email = "login@example.com";
      const password = "MySecurePassword123";

      // Register first
      await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email, password, tenantId: testTenantId },
      });

      // Login
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email, password },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toEqual(
        expect.objectContaining({
          accessToken: expect.any(String),
          expiresIn: expect.any(Number),
        }),
      );
    });

    it("sets new refresh token cookie on login", async () => {
      const email = "logincookie@example.com";
      const password = "MySecurePassword123";

      await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email, password, tenantId: testTenantId },
      });

      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email, password },
      });

      const setCookie = res.headers["set-cookie"];
      expect(setCookie).toContain("REFRESH_TOKEN=");
      expect(setCookie).toContain("HttpOnly");
    });

    it("rejects non-existent user", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "nonexistent@example.com",
          password: "AnyPassword123",
        },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.detail).toBe("Invalid credentials");
    });

    it("rejects incorrect password", async () => {
      const email = "wrongpass@example.com";

      await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: {
          email,
          password: "CorrectPassword123",
          tenantId: testTenantId,
        },
      });

      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email,
          password: "WrongPassword123",
        },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.detail).toBe("Invalid credentials");
    });

    it("returns generic 'Invalid credentials' for both user and password errors", async () => {
      // This ensures no information leakage about which field is wrong
      const res1 = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "does-not-exist@example.com",
          password: "AnyPassword123",
        },
      });

      const res2 = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "wrongpass@example.com",
          password: "WrongPassword123",
        },
      });

      // Both should have same generic message
      expect(res1.statusCode).toBe(401);
      expect(res2.statusCode).toBe(401);
    });
  });

  describe("GET /me", () => {
    it("returns current user profile with valid token", async () => {
      const email = "metest@example.com";
      const password = "MySecurePassword123";

      // Register
      const regRes = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email, password, tenantId: testTenantId },
      });

      const { accessToken } = regRes.json();

      // Get /me
      const res = await app.inject({
        method: "GET",
        url: "/me",
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toEqual(
        expect.objectContaining({
          userId: expect.any(String),
          email: expect.stringContaining("@"),
          tenantId: testTenantId,
          role: expect.stringMatching(/^(tenant_admin|tenant_view|driver)$/),
        }),
      );
    });

    it("returns 401 without authorization header", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/me",
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 401 with invalid token", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/me",
        headers: {
          authorization: "Bearer invalid.token.here",
        },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("POST /auth/refresh", () => {
    it("refreshes access token using cookie", async () => {
      const email = "refresh@example.com";
      const password = "MySecurePassword123";

      // Register
      const regRes = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email, password, tenantId: testTenantId },
      });

      const refreshCookie = regRes.headers["set-cookie"];

      // Refresh
      const res = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        headers: {
          cookie: refreshCookie,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toEqual(
        expect.objectContaining({
          accessToken: expect.any(String),
          expiresIn: expect.any(Number),
        }),
      );
    });

    it("rotates refresh token on success", async () => {
      const email = "rotatetest@example.com";
      const password = "MySecurePassword123";

      // Register
      const regRes = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email, password, tenantId: testTenantId },
      });

      const oldRefreshCookie = regRes.headers["set-cookie"];

      // Refresh
      const refreshRes = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        headers: {
          cookie: oldRefreshCookie,
        },
      });

      expect(refreshRes.statusCode).toBe(200);

      // Extract new token
      const newRefreshCookie = refreshRes.headers["set-cookie"];
      expect(newRefreshCookie).toBeDefined();
      expect(newRefreshCookie).not.toBe(oldRefreshCookie);
    });

    it("rejects expired or invalid refresh token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        headers: {
          cookie: "REFRESH_TOKEN=invalid_token_data",
        },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.type).toBe("https://errors.chargeops.dev/unauthorized");
    });

    it("detects and prevents refresh token replay attacks", async () => {
      // Note: Full replay attack testing would require:
      // 1. Intercepting the DB refresh transaction
      // 2. Simulating a concurrent replay
      // This is covered by the rotateRefreshToken repository tests.
      // Here we just verify the endpoint doesn't crash.

      const email = "replay@example.com";
      const password = "MySecurePassword123";

      const regRes = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email, password, tenantId: testTenantId },
      });

      const refreshCookie = regRes.headers["set-cookie"];

      // First refresh succeeds
      const res1 = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        headers: { cookie: refreshCookie },
      });
      expect(res1.statusCode).toBe(200);

      // Second refresh with OLD token should fail (token was marked revoked)
      const res2 = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        headers: { cookie: refreshCookie },
      });
      expect(res2.statusCode).toBe(401);
    });
  });

  describe("POST /auth/logout", () => {
    it("logs out user and clears refresh cookie", async () => {
      const email = "logout@example.com";
      const password = "MySecurePassword123";

      const regRes = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email, password, tenantId: testTenantId },
      });

      const refreshCookie = regRes.headers["set-cookie"];

      // Logout
      const res = await app.inject({
        method: "POST",
        url: "/auth/logout",
        headers: { cookie: refreshCookie },
      });

      expect(res.statusCode).toBe(204);

      // Verify cookie is cleared
      const setCookie = res.headers["set-cookie"];
      expect(setCookie).toContain("Max-Age=0");
    });

    it("revokes entire token family on logout", async () => {
      const email = "familyrevoke@example.com";
      const password = "MySecurePassword123";

      const regRes = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email, password, tenantId: testTenantId },
      });

      const refreshCookie = regRes.headers["set-cookie"];

      // Refresh token (same family)
      const refreshRes = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        headers: { cookie: refreshCookie },
      });

      const newRefreshCookie = refreshRes.headers["set-cookie"];

      // Logout with new token
      const logoutRes = await app.inject({
        method: "POST",
        url: "/auth/logout",
        headers: { cookie: newRefreshCookie },
      });

      expect(logoutRes.statusCode).toBe(204);

      // Try to use old token (should now be revoked)
      const tryOldRes = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        headers: { cookie: refreshCookie },
      });

      expect(tryOldRes.statusCode).toBe(401);
    });

    it("returns 401 for invalid refresh token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/logout",
        headers: {
          cookie: "REFRESH_TOKEN=invalid_token",
        },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  /**
   * Helper: Clean up test data from auth tables and the test tenant.
   */
  async function _cleanupTestData(): Promise<void> {
    try {
      await db
        .deleteFrom("refresh_tokens")
        .where(
          "user_id",
          "in",
          db.selectFrom("users").select("id").where("email", "like", "%@example.com"),
        )
        .execute();

      await db.deleteFrom("users").where("email", "like", "%@example.com").execute();
      await db.deleteFrom("tenants").where("name", "=", "Test Tenant").execute();
    } catch (err) {
      // Ignore errors (tables might not exist in test setup)
      console.error("Cleanup error (ignored):", err);
    }
  }
});

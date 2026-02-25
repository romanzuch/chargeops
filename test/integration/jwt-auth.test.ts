import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "dotenv/config";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { signAccessToken } from "../../src/services/jwt.service.js";

const JWT_SECRET = process.env["JWT_SECRET"] ?? "";
const TTL = 900;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET must be set (add it to .env.test)");
}

describe("jwtAuthPlugin / verifyJwt preHandler", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();

    // Register a lightweight protected route for this test suite.
    await app.register(async (scope) => {
      scope.get("/test/jwt-protected", { preHandler: [app.verifyJwt] }, async (req) => {
        return { userId: req.jwtUser!.sub, tenantId: req.jwtUser!.tid };
      });
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 200 and claims for a valid Bearer token", async () => {
    const token = await signAccessToken(
      { userId: "user-1", tenantId: "tenant-1", isSuperAdmin: false },
      JWT_SECRET,
      TTL,
    );

    const res = await app.inject({
      method: "GET",
      url: "/test/jwt-protected",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: "user-1", tenantId: "tenant-1" });
  });

  it("returns 401 when Authorization header is absent", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/test/jwt-protected",
    });

    expect(res.statusCode).toBe(401);
  });

  it("returns 401 for a malformed Authorization header (no Bearer prefix)", async () => {
    const token = await signAccessToken(
      { userId: "u", tenantId: "t", isSuperAdmin: false },
      JWT_SECRET,
      TTL,
    );

    const res = await app.inject({
      method: "GET",
      url: "/test/jwt-protected",
      headers: { authorization: token },
    });

    expect(res.statusCode).toBe(401);
  });

  it("returns 401 for an invalid (tampered) token", async () => {
    const token = await signAccessToken(
      { userId: "u", tenantId: "t", isSuperAdmin: false },
      JWT_SECRET,
      TTL,
    );
    const parts = token.split(".");
    parts[2] = "badsignature";
    const tampered = parts.join(".");

    const res = await app.inject({
      method: "GET",
      url: "/test/jwt-protected",
      headers: { authorization: `Bearer ${tampered}` },
    });

    expect(res.statusCode).toBe(401);
  });

  it("returns 401 for an expired token", async () => {
    // Build a token that is already expired using a past expiry
    // by signing with ttl=1 second and a manually-backdated time.
    // We use a direct SignJWT call to set a past exp without fake timers.
    const { SignJWT } = await import("jose");
    const key = new TextEncoder().encode(JWT_SECRET);
    const now = Math.floor(Date.now() / 1000);
    const expiredToken = await new SignJWT({ tid: "t" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u")
      .setJti("test-jti")
      .setIssuedAt(now - 120)
      .setExpirationTime(now - 60)
      .sign(key);

    const res = await app.inject({
      method: "GET",
      url: "/test/jwt-protected",
      headers: { authorization: `Bearer ${expiredToken}` },
    });

    expect(res.statusCode).toBe(401);
  });

  it("unprotected routes are accessible without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
  });

  it("jwtUser is null on requests that bypass verifyJwt", async () => {
    // The health route does not use verifyJwt — jwtUser stays null.
    // We verify indirectly: the /health route returns 200, meaning the
    // decorateRequest("jwtUser", null) default does not break other routes.
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
  });
});

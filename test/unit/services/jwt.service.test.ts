import { describe, it, expect, afterEach, vi } from "vitest";
import { signAccessToken, verifyAccessToken } from "../../../src/services/jwt.service.js";
import { UnauthorizedError } from "../../../src/http/errors.js";

// 32-character secret satisfies the HS256 key-size recommendation.
const SECRET = "unit-test-secret-exactly-32chars";
const ALT_SECRET = "different-secret-also-32-chars-x";
const TTL = 900;

afterEach(() => {
  vi.useRealTimers();
});

describe("signAccessToken", () => {
  it("returns a compact JWS (three dot-separated parts)", async () => {
    const token = await signAccessToken(
      { userId: "u1", tenantId: "t1", isSuperAdmin: false },
      SECRET,
      TTL,
    );
    expect(token.split(".")).toHaveLength(3);
  });

  it("embeds sub, tid, isSuperAdmin, jti, iat, exp in the payload", async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await signAccessToken(
      { userId: "user-123", tenantId: "tenant-456", isSuperAdmin: false },
      SECRET,
      TTL,
    );
    const payload = await verifyAccessToken(token, SECRET);

    expect(payload.sub).toBe("user-123");
    expect(payload.tid).toBe("tenant-456");
    expect(payload.isSuperAdmin).toBe(false);
    expect(typeof payload.jti).toBe("string");
    expect(payload.jti.length).toBeGreaterThan(0);
    expect(payload.iat).toBeGreaterThanOrEqual(before);
    expect(payload.exp).toBe(payload.iat + TTL);
  });

  it("embeds isSuperAdmin=true and tid=null for super admins", async () => {
    const token = await signAccessToken(
      { userId: "admin-1", tenantId: null, isSuperAdmin: true },
      SECRET,
      TTL,
    );
    const payload = await verifyAccessToken(token, SECRET);

    expect(payload.sub).toBe("admin-1");
    expect(payload.tid).toBeNull();
    expect(payload.isSuperAdmin).toBe(true);
  });

  it("respects the provided ttlSeconds", async () => {
    const token = await signAccessToken(
      { userId: "u", tenantId: "t", isSuperAdmin: false },
      SECRET,
      300,
    );
    const payload = await verifyAccessToken(token, SECRET);
    expect(payload.exp - payload.iat).toBe(300);
  });

  it("produces unique jti per call", async () => {
    const t1 = await signAccessToken({ userId: "u", tenantId: "t", isSuperAdmin: false }, SECRET, TTL);
    const t2 = await signAccessToken({ userId: "u", tenantId: "t", isSuperAdmin: false }, SECRET, TTL);
    const p1 = await verifyAccessToken(t1, SECRET);
    const p2 = await verifyAccessToken(t2, SECRET);
    expect(p1.jti).not.toBe(p2.jti);
  });
});

describe("verifyAccessToken", () => {
  it("returns the decoded payload for a valid token", async () => {
    const token = await signAccessToken(
      { userId: "u1", tenantId: "t1", isSuperAdmin: false },
      SECRET,
      TTL,
    );
    const payload = await verifyAccessToken(token, SECRET);
    expect(payload.sub).toBe("u1");
    expect(payload.tid).toBe("t1");
    expect(payload.isSuperAdmin).toBe(false);
  });

  it("throws UnauthorizedError for an expired token", async () => {
    vi.useFakeTimers();
    const token = await signAccessToken(
      { userId: "u", tenantId: "t", isSuperAdmin: false },
      SECRET,
      60,
    );
    vi.advanceTimersByTime(61_000);

    await expect(verifyAccessToken(token, SECRET)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("UnauthorizedError message is 'Token expired' for expired tokens", async () => {
    vi.useFakeTimers();
    const token = await signAccessToken(
      { userId: "u", tenantId: "t", isSuperAdmin: false },
      SECRET,
      60,
    );
    vi.advanceTimersByTime(61_000);

    await expect(verifyAccessToken(token, SECRET)).rejects.toThrow("Token expired");
  });

  it("throws UnauthorizedError for a tampered signature", async () => {
    const token = await signAccessToken(
      { userId: "u", tenantId: "t", isSuperAdmin: false },
      SECRET,
      TTL,
    );
    const parts = token.split(".");
    parts[2] = "tampered_signature_value";
    const tampered = parts.join(".");

    await expect(verifyAccessToken(tampered, SECRET)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws UnauthorizedError when signed with a different secret", async () => {
    const token = await signAccessToken(
      { userId: "u", tenantId: "t", isSuperAdmin: false },
      SECRET,
      TTL,
    );
    await expect(verifyAccessToken(token, ALT_SECRET)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws UnauthorizedError for a completely malformed token", async () => {
    await expect(verifyAccessToken("not.a.jwt", SECRET)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws UnauthorizedError for an empty string", async () => {
    await expect(verifyAccessToken("", SECRET)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

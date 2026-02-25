import { SignJWT, jwtVerify, errors as joseErrors } from "jose";
import { randomUUID } from "node:crypto";
import { UnauthorizedError } from "../http/errors.js";

/**
 * Claims embedded in every access token.
 *
 * Standard claims (sub, jti, iat, exp) follow RFC 7519.
 * `tid` is a custom claim carrying the tenant identifier (null for super admins).
 * `isSuperAdmin` indicates cross-tenant super admin access.
 */
export interface AccessTokenPayload {
  /** Subject — the authenticated user's ID. */
  sub: string;
  /** Tenant ID — the tenant scope for this token. null for super admins. */
  tid: string | null;
  /** Whether this user is a super admin (cross-tenant). */
  isSuperAdmin: boolean;
  /** JWT ID — unique per token, enables future revocation checks. */
  jti: string;
  /** Issued-at timestamp (seconds since epoch). */
  iat: number;
  /** Expiry timestamp (seconds since epoch). */
  exp: number;
}

export interface SignAccessTokenInput {
  userId: string;
  tenantId: string | null;
  isSuperAdmin: boolean;
}

/**
 * Signs a new HS256 access token.
 *
 * @param input     userId + tenantId (null for super admin) + isSuperAdmin flag
 * @param secret    HMAC secret (≥ 32 chars recommended for HS256)
 * @param ttlSeconds  Token lifetime in seconds
 * @returns Compact JWS string (header.payload.signature)
 */
export async function signAccessToken(
  input: SignAccessTokenInput,
  secret: string,
  ttlSeconds: number,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({ tid: input.tenantId, isSuperAdmin: input.isSuperAdmin })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.userId)
    .setJti(randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(key);
}

/**
 * Verifies an HS256 access token and returns the decoded payload.
 *
 * @throws {UnauthorizedError} if the token is missing, expired, tampered, or
 *   does not contain the expected claims.
 */
export async function verifyAccessToken(
  token: string,
  secret: string,
): Promise<AccessTokenPayload> {
  const key = new TextEncoder().encode(secret);

  let raw: Awaited<ReturnType<typeof jwtVerify>>["payload"];
  try {
    const result = await jwtVerify(token, key, { algorithms: ["HS256"] });
    raw = result.payload;
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      throw new UnauthorizedError("Token expired");
    }
    throw new UnauthorizedError("Invalid token");
  }

  // Validate required claims — JWTPayload uses unknown for custom fields.
  const { sub, jti, iat, exp } = raw;
  const tid = raw["tid"];
  const isSuperAdmin = raw["isSuperAdmin"];

  if (typeof sub !== "string" || sub === "") {
    throw new UnauthorizedError("Invalid token: missing sub");
  }
  // tid is null for super admins, string for tenant users
  if (tid !== null && (typeof tid !== "string" || tid === "")) {
    throw new UnauthorizedError("Invalid token: invalid tid");
  }
  if (typeof isSuperAdmin !== "boolean") {
    throw new UnauthorizedError("Invalid token: missing isSuperAdmin");
  }
  if (typeof jti !== "string" || jti === "") {
    throw new UnauthorizedError("Invalid token: missing jti");
  }
  if (typeof iat !== "number") {
    throw new UnauthorizedError("Invalid token: missing iat");
  }
  if (typeof exp !== "number") {
    throw new UnauthorizedError("Invalid token: missing exp");
  }

  return { sub, tid: tid as string | null, isSuperAdmin, jti, iat, exp };
}

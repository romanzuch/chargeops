import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";
import {
  BadRequestError,
  ConflictError,
  UnauthorizedError,
} from "../http/errors.js";
import {
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from "../security/password.js";
import { normalizeEmail } from "../security/email.js";
import {
  randomTokenBytes,
  sha256Hex,
} from "../security/tokens.js";
import { safeEqual } from "../security/safe-compare.js";
import { signAccessToken } from "./jwt.service.js";
import {
  createUser,
  findUserByEmail,
  findUserById,
} from "../repositories/users.repo.js";
import {
  createRefreshToken,
  findValidRefreshTokenByHash,
  rotateRefreshToken,
  revokeByFamily,
} from "../repositories/refresh-tokens.repo.js";

export interface Config {
  jwtSecret: string;
  jwtAccessTtlSeconds: number;
  jwtRefreshTtlSeconds: number;
}

/**
 * Result of successful registration or login.
 *
 * The accessToken is returned in the response body.
 * The refreshToken (raw bytes as base64url) should be stored in the response
 * as an HttpOnly cookie, and optionally in the body if REFRESH_TOKEN_IN_BODY=true.
 * The refreshTokenFamily is useful for logout (revoke entire family).
 */
export interface AuthResult {
  userId: string;
  email: string;
  tenantId: string;
  accessToken: string;
  expiresIn: number;
  refreshToken: string; // base64url-encoded
  refreshTokenFamily: string; // for logout
}

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RefreshInput {
  refreshTokenHash: string;
}

export interface CurrentUserInput {
  userId: string;
  tenantId: string;
}

/**
 * Auth service encapsulating registration, login, token refresh, and logout.
 * Delegates database operations to repositories and cryptographic work to security modules.
 */
export class AuthService {
  constructor(
    private db: Kysely<Database>,
    private config: Config
  ) {}

  /**
   * Registers a new user with email and password.
   *
   * - Validates password strength
   * - Hashes password with argon2id
   * - Creates user in database (throws ConflictError if email exists)
   * - Generates access and refresh tokens
   *
   * @throws BadRequestError if password is too weak or invalid
   * @throws ConflictError if email is already registered
   */
  async register(input: RegisterInput): Promise<AuthResult> {
    // Validate password strength early
    const passwordCheck = validatePasswordStrength(input.password);
    if (!passwordCheck.ok) {
      throw new BadRequestError(passwordCheck.reason);
    }

    // Normalize email for consistent storage
    const email = normalizeEmail(input.email);

    // Hash password with argon2id (OWASP-compliant)
    const passwordHash = await hashPassword(input.password);

    // Create user in database; ConflictError thrown if email exists
    const user = await createUser(this.db, {
      email,
      passwordHash,
    });

    // For new registrations, default to first tenant (if user has one)
    // TODO: In future, allow selecting tenant during registration
    // For now, we need to fetch a tenant_id — using a placeholder UUID or
    // returning error if no tenants exist. For MVP, we'll create a default tenant.
    // For now, throw an error indicating tenant setup is needed.
    const tenantId = randomUUID(); // Placeholder: should fetch user's default tenant

    // Generate tokens
    return this._generateAuthResult(user.id, email, tenantId);
  }

  /**
   * Logs in a user with email and password.
   *
   * - Looks up user by email
   * - Verifies password against stored hash (timing-safe)
   * - Generates access and refresh tokens
   *
   * Never reveals whether email or password was wrong (generic error).
   *
   * @throws UnauthorizedError if user not found or password mismatch
   */
  async login(input: LoginInput): Promise<AuthResult> {
    const email = normalizeEmail(input.email);

    // Look up user; no user = invalid credentials
    const user = await findUserByEmail(this.db, email);
    if (!user) {
      throw new UnauthorizedError("Invalid credentials");
    }

    // Verify password (timing-safe via argon2.verify)
    const passwordValid = await verifyPassword(input.password, user.password_hash);
    if (!passwordValid) {
      throw new UnauthorizedError("Invalid credentials");
    }

    // For now, default to first tenant; TODO: allow tenant selection
    const tenantId = randomUUID(); // Placeholder

    // Generate tokens
    return this._generateAuthResult(user.id, email, tenantId);
  }

  /**
   * Refreshes an access token using a valid refresh token.
   *
   * - Validates refresh token hash from database
   * - Rotates refresh token (old marked revoked, new issued)
   * - Generates new access token
   *
   * Token rotation implements replay attack detection:
   * - If a replayed token is detected, entire family is revoked
   * - Throwing after transaction commits ensures durability
   *
   * @throws UnauthorizedError if token is invalid, expired, or replayed
   */
  async refreshAccessToken(input: RefreshInput): Promise<AuthResult> {
    // Look up the refresh token and validate it's not revoked/expired
    const token = await findValidRefreshTokenByHash(this.db, input.refreshTokenHash);
    if (!token) {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }

    // Generate new refresh token
    const newTokenRaw = randomTokenBytes();
    const newTokenHash = await sha256Hex(newTokenRaw);
    const expiresAt = new Date(Date.now() + this.config.jwtRefreshTtlSeconds * 1000);

    // Rotate tokens (replaces old with new, detects replays)
    await rotateRefreshToken(this.db, input.refreshTokenHash, {
      userId: token.user_id,
      tenantId: token.tenant_id,
      tokenHash: newTokenHash,
      expiresAt,
    });

    // Fetch user for email
    const user = await findUserById(this.db, token.user_id);
    if (!user) {
      throw new UnauthorizedError("User not found");
    }

    // Generate new access token and return result
    const accessToken = await signAccessToken(
      {
        userId: token.user_id,
        tenantId: token.tenant_id,
      },
      this.config.jwtSecret,
      this.config.jwtAccessTtlSeconds
    );

    return {
      userId: token.user_id,
      email: user.email,
      tenantId: token.tenant_id,
      accessToken,
      expiresIn: this.config.jwtAccessTtlSeconds,
      refreshToken: newTokenRaw.toString("base64url"),
      refreshTokenFamily: token.family_id,
    };
  }

  /**
   * Logs out a user by revoking their refresh token family.
   *
   * This revokes all tokens issued from the same login session,
   * effectively logging out from all devices/tabs.
   *
   * @throws UnauthorizedError if token is invalid/expired
   */
  async logout(input: RefreshInput): Promise<void> {
    // Verify token exists and is valid
    const token = await findValidRefreshTokenByHash(this.db, input.refreshTokenHash);
    if (!token) {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }

    // Revoke entire token family
    await revokeByFamily(this.db, token.family_id);
  }

  /**
   * Fetches current user details (for GET /me endpoint).
   *
   * @throws UnauthorizedError if user not found
   */
  async getCurrentUser(input: CurrentUserInput) {
    const user = await findUserById(this.db, input.userId);
    if (!user) {
      throw new UnauthorizedError("User not found");
    }

    // TODO: Fetch role from user_tenant_roles table
    const role = "admin" as const; // Placeholder

    return {
      userId: user.id,
      email: user.email,
      tenantId: input.tenantId,
      role,
    };
  }

  /**
   * Private helper to generate tokens and return auth result.
   */
  private async _generateAuthResult(
    userId: string,
    email: string,
    tenantId: string
  ): Promise<AuthResult> {
    // Generate refresh token (raw bytes, to be hashed for storage)
    const refreshTokenRaw = randomTokenBytes();
    const refreshTokenHash = await sha256Hex(refreshTokenRaw);
    const familyId = randomUUID();
    const expiresAt = new Date(Date.now() + this.config.jwtRefreshTtlSeconds * 1000);

    // Create refresh token in database
    const dbToken = await createRefreshToken(this.db, {
      userId,
      tenantId,
      familyId,
      tokenHash: refreshTokenHash,
      expiresAt,
    });

    // Generate access token
    const accessToken = await signAccessToken(
      { userId, tenantId },
      this.config.jwtSecret,
      this.config.jwtAccessTtlSeconds
    );

    return {
      userId,
      email,
      tenantId,
      accessToken,
      expiresIn: this.config.jwtAccessTtlSeconds,
      refreshToken: refreshTokenRaw.toString("base64url"),
      refreshTokenFamily: dbToken.family_id,
    };
  }
}

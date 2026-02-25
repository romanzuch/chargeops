import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";
import { BadRequestError, UnauthorizedError } from "../http/errors.js";
import { hashPassword, validatePasswordStrength, verifyPassword } from "../security/password.js";
import { normalizeEmail } from "../security/email.js";
import { randomTokenBytes, sha256Hex } from "../security/tokens.js";
import { signAccessToken } from "./jwt.service.js";
import {
  createUser,
  findUserByEmail,
  findUserById,
  updateUserPassword,
  updateUserEmail,
} from "../repositories/users.repo.js";
import {
  createRefreshToken,
  findValidRefreshTokenByHash,
  rotateRefreshToken,
  revokeByFamily,
} from "../repositories/refresh-tokens.repo.js";
import {
  createUserTenantRole,
  findFirstTenantForUser,
  findTenantById,
  findUserRoleInTenant,
} from "../repositories/tenants.repo.js";

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
 * tenantId is null for super admins (cross-tenant).
 */
export interface AuthResult {
  userId: string;
  email: string;
  tenantId: string | null;
  accessToken: string;
  expiresIn: number;
  refreshToken: string; // base64url-encoded
  refreshTokenFamily: string; // for logout
}

export interface RegisterInput {
  email: string;
  password: string;
  tenantId: string;
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
  tenantId: string | null;
  isSuperAdmin: boolean;
}

export interface ChangePasswordInput {
  userId: string;
  currentPassword: string;
  newPassword: string;
}

export interface UpdateProfileInput {
  userId: string;
  email?: string;
}

/**
 * Auth service encapsulating registration, login, token refresh, and logout.
 * Delegates database operations to repositories and cryptographic work to security modules.
 */
export class AuthService {
  constructor(
    private db: Kysely<Database>,
    private config: Config,
  ) {}

  /**
   * Registers a new user with email, password, and a chosen tenant.
   *
   * - Validates password strength
   * - Hashes password with argon2id
   * - Validates that the target tenant exists
   * - Creates user and assigns tenant_view role in one transaction
   * - Generates access and refresh tokens
   *
   * @throws BadRequestError if password is too weak or invalid
   * @throws ConflictError if email is already registered
   * @throws NotFoundError if tenantId does not match an existing tenant
   */
  async register(input: RegisterInput): Promise<AuthResult> {
    // Validate password strength early (before any DB work)
    const passwordCheck = validatePasswordStrength(input.password);
    if (!passwordCheck.ok) {
      throw new BadRequestError(passwordCheck.reason);
    }

    // Validate the tenant exists before creating the user
    await findTenantById(this.db, input.tenantId);

    // Normalize email for consistent storage
    const email = normalizeEmail(input.email);

    // Hash password with argon2id (OWASP-compliant)
    const passwordHash = await hashPassword(input.password);

    // Create user and assign tenant_view role atomically.
    // ConflictError from createUser propagates out of the transaction.
    const { user } = await this.db.transaction().execute(async (trx) => {
      const user = await createUser(trx, { email, passwordHash });

      await createUserTenantRole(trx, {
        userId: user.id,
        tenantId: input.tenantId,
        role: "tenant_view",
      });

      return { user };
    });

    return this._generateAuthResult(user.id, email, input.tenantId, false);
  }

  /**
   * Logs in a user with email and password.
   *
   * - Looks up user by email
   * - Verifies password against stored hash (timing-safe)
   * - Super admins log in without a tenant context (tenantId = null)
   * - Regular users resolve their default tenant from user_tenant_roles
   * - Generates access and refresh tokens
   *
   * Never reveals whether email or password was wrong (generic error).
   *
   * @throws UnauthorizedError if user not found, password mismatch, or no tenant assigned
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

    // Super admins are cross-tenant — no tenant context in token
    if (user.is_super_admin) {
      return this._generateAuthResult(user.id, email, null, true);
    }

    // Resolve default tenant (first by creation time)
    const tenantInfo = await findFirstTenantForUser(this.db, user.id);
    if (!tenantInfo) {
      throw new UnauthorizedError("No tenant assigned to this account");
    }

    return this._generateAuthResult(user.id, email, tenantInfo.tenantId, false);
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

    // Fetch user for email and super admin flag
    const user = await findUserById(this.db, token.user_id);
    if (!user) {
      throw new UnauthorizedError("User not found");
    }

    // Generate new access token and return result
    const accessToken = await signAccessToken(
      {
        userId: token.user_id,
        tenantId: token.tenant_id,
        isSuperAdmin: user.is_super_admin,
      },
      this.config.jwtSecret,
      this.config.jwtAccessTtlSeconds,
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
   * Super admins return a synthetic profile with tenantId: null and role: 'super_admin'.
   *
   * @throws UnauthorizedError if user not found or not a member of the given tenant
   */
  async getCurrentUser(input: CurrentUserInput) {
    const user = await findUserById(this.db, input.userId);
    if (!user) {
      throw new UnauthorizedError("User not found");
    }

    if (input.isSuperAdmin) {
      return {
        userId: user.id,
        email: user.email,
        tenantId: null,
        role: "super_admin" as const,
      };
    }

    const tenantId = input.tenantId!;
    const role = await findUserRoleInTenant(this.db, input.userId, tenantId);
    if (!role) {
      throw new UnauthorizedError("User does not belong to this tenant");
    }

    return {
      userId: user.id,
      email: user.email,
      tenantId,
      role,
    };
  }

  /**
   * Changes a user's password after verifying their current password.
   *
   * @throws UnauthorizedError if user not found or current password is wrong
   * @throws BadRequestError if new password is too weak
   */
  async changePassword(input: ChangePasswordInput): Promise<void> {
    const user = await findUserById(this.db, input.userId);
    if (!user) {
      throw new UnauthorizedError("User not found");
    }

    const currentValid = await verifyPassword(input.currentPassword, user.password_hash);
    if (!currentValid) {
      throw new UnauthorizedError("Current password is incorrect");
    }

    const strengthCheck = validatePasswordStrength(input.newPassword);
    if (!strengthCheck.ok) {
      throw new BadRequestError(strengthCheck.reason);
    }

    const newHash = await hashPassword(input.newPassword);
    await updateUserPassword(this.db, input.userId, newHash);
  }

  /**
   * Updates a user's profile (currently: email).
   *
   * @throws UnauthorizedError if user not found
   * @throws ConflictError if new email is already in use
   */
  async updateProfile(input: UpdateProfileInput): Promise<{ userId: string; email: string }> {
    const user = await findUserById(this.db, input.userId);
    if (!user) {
      throw new UnauthorizedError("User not found");
    }

    if (input.email !== undefined) {
      const normalized = normalizeEmail(input.email);
      const updated = await updateUserEmail(this.db, input.userId, normalized);
      return { userId: updated.id, email: updated.email };
    }

    return { userId: user.id, email: user.email };
  }

  /**
   * Private helper to generate tokens and return auth result.
   */
  private async _generateAuthResult(
    userId: string,
    email: string,
    tenantId: string | null,
    isSuperAdmin: boolean,
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
      { userId, tenantId, isSuperAdmin },
      this.config.jwtSecret,
      this.config.jwtAccessTtlSeconds,
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

import "@fastify/cookie";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { ZodError } from "zod";
import { config } from "../config/config.js";
import { getDb } from "../db/kysely.js";
import { BadRequestError } from "../http/errors.js";
import {
  RegisterRequestSchema,
  LoginRequestSchema,
  RefreshRequestSchema,
  LogoutRequestSchema,
  AccessTokenResponseSchema,
  CurrentUserResponseSchema,
  ChangePasswordRequestSchema,
  UpdateProfileRequestSchema,
} from "../http/schemas/auth.schemas.js";
import { AuthService } from "../services/auth.service.js";
import { sha256Hex } from "../security/tokens.js";

const REFRESH_TOKEN_COOKIE_NAME = "REFRESH_TOKEN";
const COOKIE_PATH = "/";
const COOKIE_SAME_SITE = "strict";

/**
 * Auth endpoints: register, login, refresh, logout, and /me sanity check.
 *
 * Follows Fastify plugin pattern. Registered in app.ts.
 */
export const authRoutes: FastifyPluginAsync = async (app) => {
  // Lazily initialized on first request so DB is not required at plugin registration time.
  let authService: AuthService | undefined;
  const getAuthService = (): AuthService => {
    if (!authService) {
      authService = new AuthService(getDb(), {
        jwtSecret: config.jwtSecret!,
        jwtAccessTtlSeconds: config.jwtAccessTtlSeconds,
        jwtRefreshTtlSeconds: config.jwtRefreshTtlSeconds,
      });
    }
    return authService;
  };

  /**
   * POST /auth/register
   *
   * Register a new user with email and password.
   *
   * Request: { email, password, name? }
   * Response (201): { accessToken, expiresIn }
   * Cookie: REFRESH_TOKEN (httpOnly, secure, sameSite)
   *
   * Errors:
   * - 400: validation failure or weak password
   * - 409: email already registered
   */
  app.post(
    "/auth/register",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "10 minutes",
        },
      },
    },
    async (req, reply) => {
      // Validate request body
      let validated;
      try {
        validated = RegisterRequestSchema.parse(req.body);
      } catch (err) {
        if (err instanceof ZodError) {
          const errors = err.flatten().fieldErrors;
          throw new BadRequestError("Validation failed", JSON.stringify(errors));
        }
        throw err;
      }

      // Register user and generate tokens
      const result = await getAuthService().register({
        email: validated.email,
        password: validated.password,
        tenantId: validated.tenantId,
        ...(validated.name && { name: validated.name }),
      });

      // Set refresh token cookie
      _setRefreshTokenCookie(reply, result.refreshToken);

      // Build response
      const response: Record<string, unknown> = AccessTokenResponseSchema.parse({
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
      });

      // Optionally include refresh token in body
      if (config.refreshTokenInBody) {
        response.refreshToken = result.refreshToken;
      }

      return reply.status(201).send(response);
    },
  );

  /**
   * POST /auth/login
   *
   * Authenticate a user with email and password.
   *
   * Request: { email, password }
   * Response (200): { accessToken, expiresIn }
   * Cookie: REFRESH_TOKEN (httpOnly, secure, sameSite)
   *
   * Errors:
   * - 400: validation failure
   * - 401: invalid credentials (generic for security)
   */
  app.post(
    "/auth/login",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "5 minutes",
        },
      },
    },
    async (req, reply) => {
      // Validate request body
      let validated;
      try {
        validated = LoginRequestSchema.parse(req.body);
      } catch (err) {
        if (err instanceof ZodError) {
          const errors = err.flatten().fieldErrors;
          throw new BadRequestError("Validation failed", JSON.stringify(errors));
        }
        throw err;
      }

      // Authenticate user
      const result = await getAuthService().login({
        email: validated.email,
        password: validated.password,
      });

      // Set refresh token cookie
      _setRefreshTokenCookie(reply, result.refreshToken);

      // Build response
      const response: Record<string, unknown> = AccessTokenResponseSchema.parse({
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
      });

      // Optionally include refresh token in body
      if (config.refreshTokenInBody) {
        response.refreshToken = result.refreshToken;
      }

      return reply.send(response);
    },
  );

  /**
   * POST /auth/refresh
   *
   * Refresh access token using a valid refresh token.
   *
   * Refresh token is read from:
   * 1. HttpOnly cookie (preferred, automatic in browser)
   * 2. Request body refreshToken field (fallback for non-browser clients)
   *
   * Request: { refreshToken? } (optional if in cookie)
   * Response (200): { accessToken, expiresIn }
   * Cookie: NEW REFRESH_TOKEN (rotated)
   *
   * Errors:
   * - 400: validation or missing token
   * - 401: invalid, expired, or replayed token
   */
  app.post(
    "/auth/refresh",
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: "1 minute",
        },
      },
    },
    async (req, reply) => {
      // Get refresh token from cookie or body
      let refreshToken: string | undefined = req.cookies[REFRESH_TOKEN_COOKIE_NAME];
      if (!refreshToken) {
        let validated;
        try {
          validated = RefreshRequestSchema.parse(req.body);
        } catch (err) {
          if (err instanceof ZodError) {
            const errors = err.flatten().fieldErrors;
            throw new BadRequestError("Validation failed", JSON.stringify(errors));
          }
          throw err;
        }
        refreshToken = validated.refreshToken;
      }

      if (!refreshToken) {
        throw new BadRequestError("Refresh token is required");
      }

      // Hash the token for database lookup
      const tokenBuffer = Buffer.from(refreshToken, "base64url");
      const tokenHash = await sha256Hex(tokenBuffer);

      // Refresh access token (rotates refresh token)
      const result = await getAuthService().refreshAccessToken({
        refreshTokenHash: tokenHash,
      });

      // Set new refresh token cookie
      _setRefreshTokenCookie(reply, result.refreshToken);

      // Build response
      const response: Record<string, unknown> = AccessTokenResponseSchema.parse({
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
      });

      // Optionally include refresh token in body
      if (config.refreshTokenInBody) {
        response.refreshToken = result.refreshToken;
      }

      return reply.send(response);
    },
  );

  /**
   * POST /auth/logout
   *
   * Log out a user by revoking their refresh token family.
   *
   * Refresh token is read from:
   * 1. HttpOnly cookie (preferred, automatic in browser)
   * 2. Request body refreshToken field (fallback for non-browser clients)
   *
   * Request: { refreshToken? } (optional if in cookie)
   * Response (204): No Content
   * Cookie: Cleared
   *
   * Errors:
   * - 400: validation or missing token
   * - 401: invalid token
   */
  app.post("/auth/logout", async (req, reply) => {
    // Get refresh token from cookie or body
    let refreshToken: string | undefined = req.cookies[REFRESH_TOKEN_COOKIE_NAME];
    if (!refreshToken) {
      let validated;
      try {
        validated = LogoutRequestSchema.parse(req.body);
      } catch (err) {
        if (err instanceof ZodError) {
          const errors = err.flatten().fieldErrors;
          throw new BadRequestError("Validation failed", JSON.stringify(errors));
        }
        throw err;
      }
      refreshToken = validated.refreshToken;
    }

    if (!refreshToken) {
      throw new BadRequestError("Refresh token is required");
    }

    // Hash the token for database lookup
    const tokenBuffer = Buffer.from(refreshToken, "base64url");
    const tokenHash = await sha256Hex(tokenBuffer);

    // Revoke token family
    await getAuthService().logout({ refreshTokenHash: tokenHash });

    // Clear refresh token cookie
    reply.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
      path: COOKIE_PATH,
    });

    return reply.status(204).send();
  });

  /**
   * GET /me
   *
   * Protected sanity check endpoint. Returns current user's public profile.
   *
   * Requires valid JWT in Authorization: Bearer <token> header.
   *
   * Response (200): { userId, email, tenantId, role }
   * Errors:
   * - 401: missing or invalid token
   */
  app.get("/me", { preHandler: [app.verifyJwt, app.verifyTenant] }, async (req) => {
    // Request is already verified by preHandler
    const user = await getAuthService().getCurrentUser({
      userId: req.jwtUser!.sub,
      tenantId: req.jwtUser!.tid,
      isSuperAdmin: req.jwtUser!.isSuperAdmin,
    });

    return CurrentUserResponseSchema.parse(user);
  });

  /**
   * PATCH /me/password
   *
   * Change the authenticated user's password.
   *
   * Requires valid JWT. Verifies the current password before updating.
   *
   * Request: { currentPassword, newPassword }
   * Response (204): No Content
   *
   * Errors:
   * - 400: weak password
   * - 401: missing or invalid token, or wrong current password
   */
  app.patch(
    "/me/password",
    { preHandler: [app.verifyJwt] },
    async (req, reply) => {
      let body;
      try {
        body = ChangePasswordRequestSchema.parse(req.body);
      } catch (err) {
        if (err instanceof ZodError) {
          throw new BadRequestError("Validation failed", JSON.stringify(err.flatten().fieldErrors));
        }
        throw err;
      }

      await getAuthService().changePassword({
        userId: req.jwtUser!.sub,
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
      });

      return reply.status(204).send();
    },
  );

  /**
   * PATCH /me
   *
   * Update the authenticated user's profile (currently: email).
   *
   * Requires valid JWT.
   *
   * Request: { email? } — at least one field required
   * Response (200): { userId, email }
   *
   * Errors:
   * - 400: validation failure
   * - 401: missing or invalid token
   * - 409: email already in use
   */
  app.patch(
    "/me",
    { preHandler: [app.verifyJwt] },
    async (req, reply) => {
      let body;
      try {
        body = UpdateProfileRequestSchema.parse(req.body);
      } catch (err) {
        if (err instanceof ZodError) {
          throw new BadRequestError("Validation failed", JSON.stringify(err.flatten().fieldErrors));
        }
        throw err;
      }

      const updated = await getAuthService().updateProfile({
        userId: req.jwtUser!.sub,
        ...(body.email !== undefined && { email: body.email }),
      });

      return reply.send(updated);
    },
  );
};

/**
 * Helper: Set refresh token as HttpOnly cookie.
 */
function _setRefreshTokenCookie(reply: FastifyReply, tokenBase64Url: string): void {
  reply.setCookie(REFRESH_TOKEN_COOKIE_NAME, tokenBase64Url, {
    path: COOKIE_PATH,
    httpOnly: true,
    secure: config.refreshTokenCookieSecure,
    sameSite: COOKIE_SAME_SITE,
    maxAge: config.jwtRefreshTtlSeconds,
  });
}

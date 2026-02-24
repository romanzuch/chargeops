import { z } from "zod";
import { validatePasswordStrength } from "../../security/password.js";

/**
 * Email format validation following RFC 5321 conventions.
 * Normalized to lowercase for consistent storage and lookup.
 */
const emailSchema = z
  .string()
  .email("Invalid email address")
  .transform((v) => v.trim().toLowerCase());

/**
 * Password validation with minimum length enforcement.
 * Uses `superRefine` for custom error messages from validatePasswordStrength.
 */
const passwordSchema = z
  .string()
  .min(1, "Password is required")
  .superRefine((pwd, ctx) => {
    const result = validatePasswordStrength(pwd);
    if (!result.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.reason,
      });
    }
  });

/**
 * POST /auth/register request.
 *
 * - email: canonical email (normalized to lowercase)
 * - password: minimum 12 characters
 * - name: optional display name (reserved for future use)
 */
export const RegisterRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().max(255).optional(),
});

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

/**
 * POST /auth/login request.
 *
 * - email: canonical email (normalized to lowercase)
 * - password: plain-text password (verified against stored hash)
 */
export const LoginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/**
 * POST /auth/refresh request.
 *
 * Refresh token comes from:
 * 1. HttpOnly cookie (preferred, automatic in browser)
 * 2. Body refreshToken field (fallback for non-browser clients if enabled)
 */
export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required").optional(),
});

export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

/**
 * POST /auth/logout request.
 *
 * Refresh token comes from:
 * 1. HttpOnly cookie (preferred, automatic in browser)
 * 2. Body refreshToken field (fallback for non-browser clients if enabled)
 */
export const LogoutRequestSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required").optional(),
});

export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;

/**
 * Common successful auth response.
 *
 * - accessToken: JWT signed with HS256
 * - expiresIn: token lifetime in seconds
 *
 * Refresh token is sent as HttpOnly cookie (and optionally in body).
 */
export const AccessTokenResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int().positive(),
});

export type AccessTokenResponse = z.infer<typeof AccessTokenResponseSchema>;

/**
 * Optional: refresh token in body (when REFRESH_TOKEN_IN_BODY=true).
 */
export const AuthResponseWithRefreshSchema = AccessTokenResponseSchema.extend({
  refreshToken: z.string().optional(),
});

export type AuthResponseWithRefresh = z.infer<typeof AuthResponseWithRefreshSchema>;

/**
 * GET /me protected response.
 *
 * Returns current authenticated user's details.
 */
export const CurrentUserResponseSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
  tenantId: z.string(),
  role: z.enum(["admin", "operator", "viewer"]),
});

export type CurrentUserResponse = z.infer<typeof CurrentUserResponseSchema>;

import argon2 from "argon2";

export const PASSWORD_MIN_LENGTH = 12;

/**
 * Argon2id parameters following OWASP minimum recommendations.
 * https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
 *
 * Tuning guidance:
 * - Increase memoryCost first (cheaper than timeCost for security/performance).
 * - Target ~100–300 ms wall-clock time on your production hardware.
 * - Re-measure after any significant infrastructure change.
 */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB — OWASP minimum
  timeCost: 2,
  parallelism: 1,
} as const;

export type PasswordStrengthResult = { ok: true } | { ok: false; reason: string };

/**
 * Validates a plain-text password against the current policy.
 *
 * Returns a discriminated union instead of throwing so callers control
 * how to surface the error (HTTP 400, Zod refinement, etc.).
 *
 * Future: add zxcvbn entropy scoring — the signature stays the same.
 */
export function validatePasswordStrength(plain: string): PasswordStrengthResult {
  if (plain.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      reason: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
    };
  }
  return { ok: true };
}

/**
 * Hashes a plain-text password using argon2id.
 *
 * The returned string is self-describing (algorithm + params + salt + hash)
 * and can be stored directly in `users.password_hash`.
 */
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

/**
 * Verifies a plain-text password against a stored argon2 hash.
 *
 * - Never throw on mismatch — the return value is a boolean.
 * - Always use this for password verification, not `safeEqual`.
 *   argon2.verify is internally timing-safe.
 * - Always return a generic error to callers ("Invalid credentials"),
 *   never reveal whether the email or password was wrong.
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}

import crypto from "node:crypto";

/**
 * Constant-time string comparison to prevent timing attacks.
 *
 * Use this for comparing pre-hashed secrets (refresh tokens, API keys).
 * Do NOT use for password verification — use `verifyPassword()` instead,
 * as argon2.verify is internally timing-safe.
 *
 * If the two strings have different byte lengths, a dummy comparison is
 * still performed so the function takes a consistent amount of time.
 * Note: length differences are generally acceptable to leak in practice,
 * but this avoids any measurable timing oracle.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");

  if (bufA.length !== bufB.length) {
    // Run a comparison of the correct length to burn consistent time,
    // then return false — lengths differ so they cannot be equal.
    crypto.timingSafeEqual(bufA, Buffer.alloc(bufA.length));
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

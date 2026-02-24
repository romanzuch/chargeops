/**
 * Normalizes an email address for consistent storage and lookup.
 *
 * Applied rules:
 * - trim()      — removes accidental surrounding whitespace
 * - toLowerCase — case-insensitive matching (RFC 5321 local-part is technically
 *                 case-sensitive, but every major provider treats it as case-insensitive)
 *
 * Limitations:
 * - Does not strip sub-addressing (user+tag@example.com)
 * - Does not normalize Unicode domain names (IDN / Punycode)
 *
 * Always normalize before INSERT and before SELECT:
 * ```ts
 * const email = normalizeEmail(body.email);
 * const user  = await db.selectFrom("users").where("email", "=", email)…
 * ```
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

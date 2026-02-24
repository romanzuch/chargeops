import crypto from "node:crypto";

/** 32 bytes = 256 bits of entropy. More than sufficient for a refresh token. */
const DEFAULT_TOKEN_BYTES = 32;

/**
 * Generates a cryptographically secure random byte sequence.
 *
 * Recommended token lifecycle:
 * ```ts
 * const raw = randomTokenBytes();                          // generate
 * const tokenForClient = raw.toString("base64url");        // send to client (cookie / body)
 * const tokenForDb     = sha256Hex(raw);                   // store hash in DB
 * ```
 *
 * On validation, re-hash the incoming token and compare with `safeEqual`.
 */
export function randomTokenBytes(byteCount = DEFAULT_TOKEN_BYTES): Buffer {
  return crypto.randomBytes(byteCount);
}

/**
 * Computes SHA256 hash of a buffer and returns the lowercase hex string.
 *
 * Used for storing refresh token hashes in the database.
 * On validation, re-hash the incoming token and compare with `safeEqual`.
 */
export async function sha256Hex(buffer: Buffer): Promise<string> {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

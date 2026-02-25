/**
 * Seed script: create a super admin user.
 *
 * Usage:
 *   SUPER_ADMIN_EMAIL=admin@example.com SUPER_ADMIN_PASSWORD=YourStrongPass123! \
 *     tsx scripts/seed-super-admin.ts
 *
 * Reads DATABASE_URL from .env (via dotenv) or environment.
 * Idempotent: skips insertion if the email already exists.
 */

import "dotenv/config";
import { getDb } from "../src/db/kysely.js";
import { hashPassword, validatePasswordStrength } from "../src/security/password.js";

const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.SUPER_ADMIN_PASSWORD;

if (!email) {
  console.error("Error: SUPER_ADMIN_EMAIL is not set.");
  process.exit(1);
}
if (!password) {
  console.error("Error: SUPER_ADMIN_PASSWORD is not set.");
  process.exit(1);
}

const passwordCheck = validatePasswordStrength(password);
if (!passwordCheck.ok) {
  console.error(`Error: weak password — ${passwordCheck.reason}`);
  process.exit(1);
}

const db = getDb();

try {
  // Check if user already exists
  const existing = await db
    .selectFrom("users")
    .select("id")
    .where("email", "=", email)
    .executeTakeFirst();

  if (existing) {
    console.log(`Super admin already exists (id=${existing.id}), skipping.`);
    process.exit(0);
  }

  const passwordHash = await hashPassword(password);

  const user = await db
    .insertInto("users")
    .values({
      email,
      password_hash: passwordHash,
      is_super_admin: true,
    })
    .returning(["id", "email"])
    .executeTakeFirstOrThrow();

  console.log(`Super admin created: id=${user.id}, email=${user.email}`);
} finally {
  await db.destroy();
}

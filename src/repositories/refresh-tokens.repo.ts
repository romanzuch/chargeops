import { sql, type Kysely, type Selectable, type Transaction } from "kysely";
import type { Database, RefreshTokensTable } from "../db/types.js";
import { UnauthorizedError } from "../http/errors.js";

export interface CreateRefreshTokenInput {
  userId: string;
  tenantId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
}

export async function createRefreshToken(
  db: Kysely<Database>,
  input: CreateRefreshTokenInput,
): Promise<Selectable<RefreshTokensTable>> {
  return db
    .insertInto("refresh_tokens")
    .values({
      user_id: input.userId,
      tenant_id: input.tenantId,
      family_id: input.familyId,
      token_hash: input.tokenHash,
      expires_at: input.expiresAt,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function findValidRefreshTokenByHash(
  db: Kysely<Database>,
  tokenHash: string,
): Promise<Selectable<RefreshTokensTable> | undefined> {
  return db
    .selectFrom("refresh_tokens")
    .selectAll()
    .where("token_hash", "=", tokenHash)
    .where("revoked_at", "is", null)
    .where("expires_at", ">", sql<Date>`now()`)
    .executeTakeFirst();
}

export async function revokeByFamily(db: Kysely<Database>, familyId: string): Promise<void> {
  await db
    .updateTable("refresh_tokens")
    .set({ revoked_at: sql<Date>`now()` })
    .where("family_id", "=", familyId)
    .where("revoked_at", "is", null)
    .execute();
}

export async function revokeAllForUser(db: Kysely<Database>, userId: string): Promise<void> {
  await db
    .updateTable("refresh_tokens")
    .set({ revoked_at: sql<Date>`now()` })
    .where("user_id", "=", userId)
    .where("revoked_at", "is", null)
    .execute();
}

export async function rotateRefreshToken(
  db: Kysely<Database>,
  oldTokenHash: string,
  newToken: Omit<CreateRefreshTokenInput, "familyId">,
): Promise<Selectable<RefreshTokensTable>> {
  // Use flag variables so we can throw AFTER the transaction commits.
  // Throwing inside the callback would roll back the transaction, undoing
  // the revokeByFamily call that must be durably committed on replay attacks.
  let missing = false;
  let replayDetected = false;

  const result = await db.transaction().execute(async (trx: Transaction<Database>) => {
    const old = await trx
      .selectFrom("refresh_tokens")
      .selectAll()
      .where("token_hash", "=", oldTokenHash)
      .forUpdate()
      .executeTakeFirst();

    if (!old) {
      missing = true;
      return null;
    }

    if (old.revoked_at !== null) {
      await revokeByFamily(trx, old.family_id);
      replayDetected = true;
      return null;
    }

    await trx
      .updateTable("refresh_tokens")
      .set({ revoked_at: sql<Date>`now()` })
      .where("id", "=", old.id)
      .execute();

    return trx
      .insertInto("refresh_tokens")
      .values({
        user_id: newToken.userId,
        tenant_id: newToken.tenantId,
        family_id: old.family_id,
        token_hash: newToken.tokenHash,
        expires_at: newToken.expiresAt,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  });

  if (missing) {
    throw new UnauthorizedError("Invalid refresh token");
  }
  if (replayDetected) {
    throw new UnauthorizedError("Refresh token reuse detected");
  }

  return result!;
}

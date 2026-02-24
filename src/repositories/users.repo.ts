import type { Kysely, Selectable } from "kysely";
import type { Database, UsersTable } from "../db/types.js";
import { ConflictError } from "../http/errors.js";

export interface CreateUserInput {
  email: string;
  passwordHash: string;
}

export async function createUser(
  db: Kysely<Database>,
  input: CreateUserInput,
): Promise<Selectable<UsersTable>> {
  try {
    return await db
      .insertInto("users")
      .values({
        email: input.email,
        password_hash: input.passwordHash,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      throw new ConflictError("Email already in use");
    }
    throw err;
  }
}

export async function findUserByEmail(
  db: Kysely<Database>,
  email: string,
): Promise<Selectable<UsersTable> | undefined> {
  return db
    .selectFrom("users")
    .selectAll()
    .where("email", "=", email)
    .executeTakeFirst();
}

export async function findUserById(
  db: Kysely<Database>,
  id: string,
): Promise<Selectable<UsersTable> | undefined> {
  return db
    .selectFrom("users")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "23505"
  );
}

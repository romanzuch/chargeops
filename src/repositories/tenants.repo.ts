import type { Kysely, Selectable } from "kysely";
import type { Database, Role, TenantsTable, UserTenantRolesTable } from "../db/types.js";

export async function createTenant(
  db: Kysely<Database>,
  input: { name: string },
): Promise<Selectable<TenantsTable>> {
  return db
    .insertInto("tenants")
    .values({ name: input.name })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function createUserTenantRole(
  db: Kysely<Database>,
  input: { userId: string; tenantId: string; role: Role },
): Promise<Selectable<UserTenantRolesTable>> {
  return db
    .insertInto("user_tenant_roles")
    .values({
      user_id: input.userId,
      tenant_id: input.tenantId,
      role: input.role,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

/**
 * Returns the first tenant membership for a user, ordered by creation time.
 * Used by login to resolve the default tenant context.
 */
export async function findFirstTenantForUser(
  db: Kysely<Database>,
  userId: string,
): Promise<{ tenantId: string; role: Role } | undefined> {
  const row = await db
    .selectFrom("user_tenant_roles")
    .select(["tenant_id", "role"])
    .where("user_id", "=", userId)
    .orderBy("created_at", "asc")
    .limit(1)
    .executeTakeFirst();

  if (!row) return undefined;
  return { tenantId: row.tenant_id, role: row.role };
}

/**
 * Returns the role for a user within a specific tenant, or undefined if the
 * user is not a member of that tenant.
 */
export async function findUserRoleInTenant(
  db: Kysely<Database>,
  userId: string,
  tenantId: string,
): Promise<Role | undefined> {
  const row = await db
    .selectFrom("user_tenant_roles")
    .select("role")
    .where("user_id", "=", userId)
    .where("tenant_id", "=", tenantId)
    .executeTakeFirst();

  return row?.role;
}

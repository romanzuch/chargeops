import type { Kysely, Selectable } from "kysely";
import type { Database, Role, TenantsTable, UserTenantRolesTable } from "../db/types.js";
import { NotFoundError } from "../http/errors.js";

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

export async function findTenantById(
  db: Kysely<Database>,
  id: string,
): Promise<Selectable<TenantsTable>> {
  const row = await db
    .selectFrom("tenants")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!row) throw new NotFoundError(`Tenant not found: ${id}`);
  return row;
}

export async function findAllTenants(
  db: Kysely<Database>,
): Promise<Selectable<TenantsTable>[]> {
  return db.selectFrom("tenants").selectAll().orderBy("created_at", "asc").execute();
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

export interface TenantUserRow {
  userId: string;
  email: string;
  role: Role;
  memberSince: Date;
}

/**
 * Returns all users in a tenant with their roles, ordered by join date.
 */
export async function findUsersInTenant(
  db: Kysely<Database>,
  tenantId: string,
): Promise<TenantUserRow[]> {
  const rows = await db
    .selectFrom("user_tenant_roles as utr")
    .innerJoin("users", "users.id", "utr.user_id")
    .select([
      "users.id as user_id",
      "users.email",
      "utr.role",
      "utr.created_at",
    ])
    .where("utr.tenant_id", "=", tenantId)
    .orderBy("utr.created_at", "asc")
    .execute();

  return rows.map((r) => ({
    userId: r.user_id,
    email: r.email,
    role: r.role,
    memberSince: r.created_at,
  }));
}

/**
 * Updates a user's role within a tenant. Returns the updated row, or
 * undefined if the user is not a member of that tenant.
 */
export async function updateUserTenantRole(
  db: Kysely<Database>,
  userId: string,
  tenantId: string,
  newRole: Role,
): Promise<Selectable<UserTenantRolesTable> | undefined> {
  return db
    .updateTable("user_tenant_roles")
    .set({ role: newRole })
    .where("user_id", "=", userId)
    .where("tenant_id", "=", tenantId)
    .returningAll()
    .executeTakeFirst();
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

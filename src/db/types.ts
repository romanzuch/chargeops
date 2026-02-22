/**
 * Database schema types for Kysely.
 *
 * Keep this file close to your migrations. A common workflow is:
 * 1) Change SQL migration
 * 2) Update these types
 * 3) Use Kysely to get end-to-end type safety
 */

export type Role = "admin" | "operator" | "viewer";

/**
 * Notes on timestamps:
 * - In SQL we use `timestamptz`
 * - In Node we model it as `Date`
 */
type Timestamp = Date;

export interface TenantsTable {
  id: string; // uuid
  name: string;
  created_at: Timestamp;
}

export interface UsersTable {
  id: string; // uuid
  email: string;
  password_hash: string;
  created_at: Timestamp;
}

export interface UserTenantRolesTable {
  user_id: string; // uuid
  tenant_id: string; // uuid
  role: Role;
  created_at: Timestamp;
}

export interface RefreshTokensTable {
  id: string; // uuid
  user_id: string; // uuid
  tenant_id: string; // uuid
  token_hash: string;
  expires_at: Timestamp;
  revoked_at: Timestamp | null;
  created_at: Timestamp;
}

/**
 * Root DB type for Kysely.
 *
 * The keys must match your table names.
 */
export interface Database {
  tenants: TenantsTable;
  users: UsersTable;
  user_tenant_roles: UserTenantRolesTable;
  refresh_tokens: RefreshTokensTable;
}

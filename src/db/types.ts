export type Role = "admin" | "operator" | "viewer";

export interface TenantsTable {
  id: string; // uuid
  name: string;
  created_at: Date;
}

export interface UsersTable {
  id: string; // uuid
  email: string;
  password_hash: string;
  created_at: Date;
}

export interface UserTenantRolesTable {
  user_id: string; // uuid
  tenant_id: string; // uuid
  role: Role;
  created_at: Date;
}

export interface RefreshTokensTable {
  id: string; // uuid
  user_id: string;
  tenant_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}

/**
 * Kysely Database interface
 * Keys must match actual table names in Postgres.
 */
export interface Database {
  tenants: TenantsTable;
  users: UsersTable;
  user_tenant_roles: UserTenantRolesTable;
  refresh_tokens: RefreshTokensTable;
}

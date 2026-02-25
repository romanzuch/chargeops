/**
 * Database schema types for Kysely.
 *
 * Keep this file close to your migrations. A common workflow is:
 * 1) Change SQL migration
 * 2) Update these types
 * 3) Use Kysely to get end-to-end type safety
 */

import type { Generated } from "kysely";

export type Role = "tenant_admin" | "tenant_view" | "driver";
export type StationStatus = "active" | "planning" | "inactive" | "error";
export type StationVisibility = "public" | "private";

/**
 * Notes on timestamps:
 * - In SQL we use `timestamptz`
 * - In Node we model it as `Date`
 *
 * Columns marked Generated<T> have a DB-level default and are optional in
 * INSERT statements (Kysely's Insertable<T> helper makes them optional).
 */
type Timestamp = Date;

export interface TenantsTable {
  id: Generated<string>; // uuid, gen_random_uuid()
  name: string;
  created_at: Generated<Timestamp>;
}

export interface UsersTable {
  id: Generated<string>; // uuid, gen_random_uuid()
  email: string;
  password_hash: string;
  is_super_admin: Generated<boolean>;
  created_at: Generated<Timestamp>;
}

export interface UserTenantRolesTable {
  user_id: string; // uuid
  tenant_id: string; // uuid
  role: Role;
  created_at: Generated<Timestamp>;
}

export interface RefreshTokensTable {
  id: Generated<string>; // uuid, gen_random_uuid()
  user_id: string; // uuid
  tenant_id: string | null; // uuid; null for super admin sessions
  family_id: Generated<string>; // uuid, gen_random_uuid() — callers may override
  token_hash: string;
  expires_at: Timestamp;
  revoked_at: Timestamp | null;
  created_at: Generated<Timestamp>;
}

export interface StationsTable {
  id: Generated<string>; // uuid, gen_random_uuid()
  external_id: string | null;
  name: string;
  tenant_id: string; // uuid
  latitude: number | null;
  longitude: number | null;
  status: Generated<StationStatus>; // default 'active'
  visibility: Generated<StationVisibility>; // default 'public'
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  deleted_at: Timestamp | null;
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
  stations: StationsTable;
}

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
export type LocationVisibility = "public" | "private";
export type ConnectorType = "ccs" | "chademo" | "type2" | "type1" | "schuko" | "other";
export type PlugStatus = "available" | "occupied" | "out_of_service" | "reserved";

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
  location_id: string | null; // uuid; FK to locations
  status: Generated<StationStatus>; // default 'active'
  visibility: Generated<StationVisibility>; // default 'public'
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  deleted_at: Timestamp | null;
}

export interface LocationsTable {
  id: Generated<string>; // uuid, gen_random_uuid()
  tenant_id: string; // uuid
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  visibility: Generated<LocationVisibility>; // default 'public'
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  deleted_at: Timestamp | null;
}

export interface PlugsTable {
  id: Generated<string>; // uuid, gen_random_uuid()
  station_id: string; // uuid
  connector_type: ConnectorType;
  max_power_kw: number;
  status: Generated<PlugStatus>; // default 'available'
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  deleted_at: Timestamp | null;
}

export interface TariffsTable {
  id: Generated<string>; // uuid, gen_random_uuid()
  tenant_id: string; // uuid
  name: string;
  price_per_kwh: number | null;
  price_per_minute: number | null;
  price_per_session: number | null;
  currency: Generated<string>; // default 'EUR'
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  deleted_at: Timestamp | null;
}

export interface CustomerGroupsTable {
  id: Generated<string>; // uuid, gen_random_uuid()
  tenant_id: string; // uuid
  name: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface UserCustomerGroupsTable {
  user_id: string; // uuid
  customer_group_id: string; // uuid
  created_at: Generated<Timestamp>;
}

export interface TariffZonesTable {
  id: Generated<string>; // uuid, gen_random_uuid()
  tenant_id: string; // uuid
  name: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface TariffZoneLocationsTable {
  tariff_zone_id: string; // uuid
  location_id: string; // uuid
  created_at: Generated<Timestamp>;
}

export interface TariffZoneTariffsTable {
  tariff_zone_id: string; // uuid
  tariff_id: string; // uuid
  created_at: Generated<Timestamp>;
}

export interface CustomerGroupTariffZonesTable {
  customer_group_id: string; // uuid
  tariff_zone_id: string; // uuid
  created_at: Generated<Timestamp>;
}

export interface CustomerGroupTariffsTable {
  customer_group_id: string; // uuid
  tariff_id: string; // uuid
  created_at: Generated<Timestamp>;
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
  locations: LocationsTable;
  plugs: PlugsTable;
  tariffs: TariffsTable;
  customer_groups: CustomerGroupsTable;
  user_customer_groups: UserCustomerGroupsTable;
  tariff_zones: TariffZonesTable;
  tariff_zone_locations: TariffZoneLocationsTable;
  tariff_zone_tariffs: TariffZoneTariffsTable;
  customer_group_tariff_zones: CustomerGroupTariffZonesTable;
  customer_group_tariffs: CustomerGroupTariffsTable;
}

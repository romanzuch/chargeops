-- Migration 005: Roles refactor + super admin support
--
-- 1. Add is_super_admin flag to users
-- 2. Replace role CHECK ('admin','operator','viewer') with ('tenant_admin','tenant_view','driver')
-- 3. Migrate existing role data
-- 4. Make refresh_tokens.tenant_id nullable (super admin sessions have no tenant)

-- 1. Add is_super_admin to users
ALTER TABLE users
  ADD COLUMN is_super_admin BOOLEAN NOT NULL DEFAULT false;

-- 2. Migrate role data BEFORE dropping the constraint
UPDATE user_tenant_roles SET role = 'tenant_admin' WHERE role = 'admin';
UPDATE user_tenant_roles SET role = 'tenant_view'  WHERE role = 'viewer';
UPDATE user_tenant_roles SET role = 'driver'        WHERE role = 'operator';

-- 3. Replace the role CHECK constraint
ALTER TABLE user_tenant_roles
  DROP CONSTRAINT IF EXISTS user_tenant_roles_role_check;

ALTER TABLE user_tenant_roles
  ADD CONSTRAINT user_tenant_roles_role_check
  CHECK (role IN ('tenant_admin', 'tenant_view', 'driver'));

-- 4. Make refresh_tokens.tenant_id nullable for super admin sessions
ALTER TABLE refresh_tokens
  ALTER COLUMN tenant_id DROP NOT NULL;

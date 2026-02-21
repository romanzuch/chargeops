-- base schema for saas identity, tenants, refresh tokens

BEGIN;

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Tenants
CREATE TABLE IF NOT EXISTS tenants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_unique UNIQUE(email)
);

-- User <-> Tenant roles
CREATE TABLE IF NOT EXISTS user_tenant_roles (
  user_id       uuid NOT NULL,
  tenant_id     uuid NOT NULL,
  role          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT user_tenant_roles_pk PRIMARY KEY (user_id, tenant_id),
  CONSTRAINT user_tenant_roles_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT user_tenant_roles_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT user_tenant_roles_role_check CHECK (role IN ('admin', 'operator', 'viewer'))
);

-- Refresh tokens (hashed)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  tenant_id     uuid NOT NULL,
  token_hash    text NOT NULL,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT refresh_token_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT refresh_token_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT refresh_token_expires_check CHECK (expires_at > created_at)
);

-- Indexes for token lookup
-- Indexes for token lookup
CREATE INDEX IF NOT EXISTS refresh_tokens_token_hash_idx
  ON refresh_tokens (token_hash);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_tenant_active_idx
  ON refresh_tokens (user_id, tenant_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS user_tenant_roles_tenant_id_idx
  ON user_tenant_roles (tenant_id);

COMMIT;
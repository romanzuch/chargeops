BEGIN;

CREATE TABLE IF NOT EXISTS locations (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  address       text,
  city          text,
  country       text,
  latitude      double precision,
  longitude     double precision,
  visibility    text        NOT NULL DEFAULT 'public'
                  CONSTRAINT locations_visibility_check
                  CHECK (visibility IN ('public', 'private')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE INDEX IF NOT EXISTS locations_tenant_id_idx ON locations (tenant_id);

-- Add location FK to stations, drop coordinate columns
ALTER TABLE stations ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES locations(id);
ALTER TABLE stations DROP COLUMN IF EXISTS latitude;
ALTER TABLE stations DROP COLUMN IF EXISTS longitude;

COMMIT;

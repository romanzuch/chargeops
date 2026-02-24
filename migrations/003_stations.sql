BEGIN; 

CREATE TABLE IF NOT EXISTS stations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT,

  name TEXT NOT NULL,

  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,

  status TEXT NOT NULL DEFAULT 'active',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT status_type_check CHECK (status IN ('active', 'planning', 'inactive', 'error'))
);

COMMIT;
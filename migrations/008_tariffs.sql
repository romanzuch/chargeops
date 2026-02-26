BEGIN;

CREATE TABLE IF NOT EXISTS tariffs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name              text        NOT NULL,
  price_per_kwh     numeric(10,4),
  price_per_minute  numeric(10,4),
  price_per_session numeric(10,4),
  currency          text        NOT NULL DEFAULT 'EUR',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

COMMIT;

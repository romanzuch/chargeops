BEGIN;

CREATE TABLE IF NOT EXISTS charging_sessions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users(id),
  plug_id     uuid        NOT NULL REFERENCES plugs(id),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id),
  tariff_id   uuid        REFERENCES tariffs(id),
  started_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz,
  -- Placeholders for future OCPP integration:
  energy_kwh  numeric(10,3),
  cost        numeric(10,2),
  currency    text,
  status      text        NOT NULL DEFAULT 'active'
                CONSTRAINT charging_sessions_status_check
                CHECK (status IN ('active', 'completed', 'error')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS charging_sessions_user_id_idx   ON charging_sessions (user_id);
CREATE INDEX IF NOT EXISTS charging_sessions_tenant_id_idx ON charging_sessions (tenant_id);
CREATE INDEX IF NOT EXISTS charging_sessions_plug_id_idx   ON charging_sessions (plug_id);

COMMIT;
